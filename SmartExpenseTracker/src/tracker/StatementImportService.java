package tracker;

import static tracker.CsvParser.*;
import static tracker.PasswordService.sha;
import static tracker.Records.audit;
import static tracker.Records.id;
import static tracker.Records.row;
import static tracker.Validation.MAX_ROWS;
import static tracker.Validation.METHODS;
import static tracker.Validation.date;
import static tracker.Validation.money;
import static tracker.Validation.month;
import static tracker.Validation.text;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.ResolverStyle;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/** Maps bank CSV columns, detects duplicate/conflicting references and migrates legacy expenses. */
public final class StatementImportService {

    private final TransactionService transactions;

    StatementImportService(TransactionService transactions) {
        this.transactions = transactions;
    }

    static int mapping(Map<String, String> f, String key, List<String> header, String... fallback) {
        String raw = f.getOrDefault("map_" + key, "");
        if (!raw.isEmpty()) {
            try {
                int i = Integer.parseInt(raw);
                if (i < -1 || i >= header.size()) throw new Exception();
                return i;
            } catch (Exception e) {
                throw new IllegalArgumentException("Invalid column mapping.");
            }
        }
        for (String name : fallback)
            for (int i = 0; i < header.size(); i++) if (
                header.get(i).trim().equalsIgnoreCase(name)
            ) return i;
        return -1;
    }

    static String bankMoney(String value) {
        return money(value.replace(",", "").replace("₹", "").trim());
    }

    static boolean positiveCell(String value) {
        if (value.isBlank() || value.equals("-")) return false;
        try {
            int sign = new BigDecimal(value.replace(",", "").replace("₹", "").trim()).signum();
            if (sign < 0) throw new IllegalArgumentException(
                "Debit/credit amounts cannot be negative."
            );
            return sign > 0;
        } catch (Exception e) {
            throw new IllegalArgumentException("Invalid debit/credit amount.");
        }
    }

    static boolean sameIncoming(Map<String, String> a, Map<String, String> b) {
        for (String key : List.of(
            "date",
            "amount",
            "direction",
            "description",
            "method",
            "account"
        ))
            if (!a.get(key).equals(b.get(key))) return false;
        return true;
    }

    ImportResult importRows(Account a, Map<String, String> f) {
        String input = text(f, "csv", 2 * 1024 * 1024, true);
        List<List<String>> rows = csv(input);
        if (rows.size() < 2) throw new IllegalArgumentException(
            "The CSV needs a header and at least one transaction."
        );
        List<String> h = rows.get(0);
        int ref = mapping(
                f,
                "id",
                h,
                "transaction_id",
                "reference",
                "utr",
                "ref no",
                "reference no"
            ),
            dt = mapping(f, "date", h, "date", "transaction date", "txn date"),
            desc = mapping(f, "description", h, "description", "narration", "particulars"),
            amt = mapping(f, "amount", h, "amount"),
            dir = mapping(f, "direction", h, "direction", "type"),
            debit = mapping(f, "debit", h, "debit", "withdrawal", "withdrawals"),
            credit = mapping(f, "credit", h, "credit", "deposit", "deposits"),
            method = mapping(f, "method", h, "method", "payment_method"),
            account = mapping(f, "account", h, "account");
        boolean split = "split".equals(
            f.getOrDefault("amountMode", debit >= 0 || credit >= 0 ? "split" : "single")
        );
        if (
            ref < 0 ||
            dt < 0 ||
            desc < 0 ||
            (!split && (amt < 0 || dir < 0)) ||
            (split && debit < 0 && credit < 0)
        ) throw new IllegalArgumentException(
            "Map a reference, date, description, and either amount + direction or debit/credit columns."
        );
        String defaultAccount = text(f, "defaultAccount", 80, false);
        if (account < 0 && defaultAccount.isEmpty()) throw new IllegalArgumentException(
            "Give this bank account a label."
        );
        String defaultMethod = f.getOrDefault("defaultMethod", "Bank");
        if (!Arrays.asList(METHODS).contains(defaultMethod)) throw new IllegalArgumentException(
            "Choose a default payment method."
        );
        Map<String, Map<String, String>> seen = new HashMap<>();
        for (var r : a.inbox) seen.put(r.get("key"), r);
        List<Map<String, String>> result = new ArrayList<>();
        int duplicates = 0;
        for (int n = 1; n < rows.size(); n++) {
            try {
                List<String> r = rows.get(n);
                if (r.size() != h.size()) throw new IllegalArgumentException(
                    "Column count differs from the header."
                );
                String d = cell(r, dt);
                if ("DMY".equals(f.get("dateFormat"))) {
                    DateTimeFormatter fmt = DateTimeFormatter.ofPattern(
                        "dd/MM/uuuu"
                    ).withResolverStyle(ResolverStyle.STRICT);
                    try {
                        d = LocalDate.parse(d.replace('-', '/'), fmt).toString();
                    } catch (Exception e) {
                        throw new IllegalArgumentException("Use DD/MM/YYYY dates.");
                    }
                }
                String amount, direction;
                if (split) {
                    String db = cell(r, debit),
                        cr = cell(r, credit);
                    boolean isDb = positiveCell(db),
                        isCr = positiveCell(cr);
                    if (isDb == isCr) throw new IllegalArgumentException(
                        "Exactly one of debit or credit must be positive."
                    );
                    amount = bankMoney(isDb ? db : cr);
                    direction = isDb ? "DEBIT" : "CREDIT";
                } else {
                    amount = bankMoney(cell(r, amt));
                    direction = switch (cell(r, dir).toUpperCase(Locale.ROOT)) {
                        case "DR", "D", "DEBIT" -> "DEBIT";
                        case "CR", "C", "CREDIT" -> "CREDIT";
                        default -> throw new IllegalArgumentException(
                            "Direction must be DEBIT/DR or CREDIT/CR."
                        );
                    };
                }
                String pm = cell(r, method);
                if (pm.isEmpty()) pm = defaultMethod;
                String ac = cell(r, account);
                if (ac.isEmpty()) ac = defaultAccount;
                var entry = transactions.incoming(
                    row(
                        "transaction_id",
                        cell(r, ref),
                        "date",
                        d,
                        "description",
                        cell(r, desc),
                        "amount",
                        amount,
                        "direction",
                        direction,
                        "method",
                        pm,
                        "account",
                        ac
                    ),
                    "statement"
                );
                var old = seen.get(entry.get("key"));
                if (old != null) {
                    if (!sameIncoming(old, entry)) throw new IllegalArgumentException(
                        "This reference already exists with different details. Resolve the conflict before importing."
                    );
                    duplicates++;
                } else {
                    result.add(entry);
                    seen.put(entry.get("key"), entry);
                }
            } catch (IllegalArgumentException e) {
                throw new IllegalArgumentException("Row " + (n + 1) + ": " + e.getMessage());
            }
        }
        if (a.inbox.size() + result.size() > MAX_ROWS) throw new IllegalArgumentException(
            "Maximum imported-entry count reached."
        );
        return new ImportResult(result, duplicates);
    }

    int legacyImport(Account a, Map<String, String> f) {
        String input = text(f, "csv", 2 * 1024 * 1024, true);
        List<List<String>> rows = csv(input);
        List<Map<String, String>> entries = new ArrayList<>();
        Set<String> months = new HashSet<>();
        Map<String, Map<String, String>> seen = new HashMap<>();
        for (var existing : a.transactions) seen.put(existing.get("id"), existing);
        int i = 0;
        for (List<String> r : rows) {
            i++;
            if (r.size() != 4 && r.size() != 5) throw new IllegalArgumentException(
                "Legacy row " + i + " needs 4 or 5 columns without a header."
            );
            int offset = r.size() == 5 ? 1 : 0;
            String key =
                "legacy-" +
                (offset == 1 ? UUID.fromString(r.get(0)).toString() : sha(input + "_" + i));
            var t = transactions.transaction(
                row(
                    "date",
                    r.get(offset),
                    "description",
                    r.get(offset + 1),
                    "category",
                    r.get(offset + 2),
                    "amount",
                    r.get(offset + 3),
                    "method",
                    "Other",
                    "type",
                    "expense",
                    "notes",
                    "Imported from the original tracker; payment method was not recorded."
                ),
                key,
                "legacy",
                ""
            );
            var old = seen.get(key);
            if (old != null) {
                for (String k : List.of("date", "description", "category", "amount"))
                    if (!old.get(k).equals(t.get(k))) throw new IllegalArgumentException(
                        "A legacy ID has conflicting data."
                    );
            } else {
                entries.add(t);
                seen.put(key, t);
            }
            months.add(t.get("date").substring(0, 7));
        }
        if (a.transactions.size() + entries.size() > MAX_ROWS) throw new IllegalArgumentException(
            "Maximum transaction count reached."
        );
        a.transactions.addAll(entries);
        String budget = f.getOrDefault("budget", "").trim();
        if (!budget.isEmpty()) {
            budget = money(budget);
            months.add(YearMonth.now(ZoneId.of("Asia/Kolkata")).toString());
            for (String m : months) {
                String key = m + "_Overall";
                if (a.budgets.stream().noneMatch(b -> b.get("id").equals(key))) a.budgets.add(
                    row("id", key, "month", m, "category", "Overall", "amount", budget)
                );
            }
        }
        audit(a, a.name, "Migrated " + entries.size() + " legacy expenses");
        return entries.size();
    }
}
