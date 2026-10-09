package tracker;

import static tracker.PasswordService.sha;
import static tracker.Records.find;
import static tracker.Records.id;
import static tracker.Records.row;
import static tracker.Validation.CATEGORIES;
import static tracker.Validation.MAX_ROWS;
import static tracker.Validation.METHODS;
import static tracker.Validation.choice;
import static tracker.Validation.date;
import static tracker.Validation.money;
import static tracker.Validation.month;
import static tracker.Validation.text;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** Creates validated ledger/import records, saves budgets and reviews incoming payments. */
public final class TransactionService {

    Map<String, String> transaction(
        Map<String, String> f,
        String id,
        String source,
        String inboxId
    ) {
        return row(
            "id",
            id,
            "date",
            date(f.getOrDefault("date", "")),
            "description",
            text(f, "description", 100, true),
            "category",
            choice(f, "category", CATEGORIES),
            "amount",
            money(f.get("amount")),
            "type",
            choice(f, "type", "expense", "income", "refund", "transfer"),
            "method",
            choice(f, "method", METHODS),
            "notes",
            text(f, "notes", 500, false),
            "source",
            source,
            "inboxId",
            inboxId
        );
    }

    static String suggested(String desc) {
        String s = desc.toLowerCase(Locale.ROOT);
        if (
            s.matches(".*(canteen|cafe|coffee|food|grocery|restaurant|dosa|swiggy|zomato).*")
        ) return "Food";
        if (s.matches(".*(metro|uber|ola|train|fuel|bus).*")) return "Travel";
        if (s.matches(".*(book|college|tuition|course|stationery).*")) return "Education";
        if (s.matches(".*(amazon|flipkart|shopping|shoe|clothes).*")) return "Shopping";
        if (s.matches(".*(netflix|spotify|cinema|movie|game).*")) return "Entertainment";
        if (s.matches(".*(recharge|electric|bill|rent|internet).*")) return "Bills";
        if (s.matches(".*(pharmacy|clinic|hospital|doctor).*")) return "Health";
        return "Other";
    }

    Map<String, String> incoming(Map<String, String> f, String source) {
        String reference = text(f, "transaction_id", 120, true),
            account = text(f, "account", 80, true),
            description = text(f, "description", 100, true);
        return row(
            "id",
            id(),
            "key",
            sha(account + "\u0000" + reference),
            "reference",
            reference,
            "account",
            account,
            "date",
            date(f.getOrDefault("date", "")),
            "description",
            description,
            "amount",
            money(f.get("amount")),
            "direction",
            choice(f, "direction", "DEBIT", "CREDIT"),
            "method",
            choice(f, "method", METHODS),
            "source",
            source,
            "suggested",
            suggested(description),
            "status",
            "pending",
            "ledgerId",
            "",
            "note",
            "",
            "receivedAt",
            Instant.now().toString()
        );
    }

    void checkDirection(Map<String, String> item, String type) {
        if (
            item.get("direction").equals("DEBIT") && !Set.of("expense", "transfer").contains(type)
        ) throw new IllegalArgumentException("A debit can be an expense or a transfer.");
        if (
            item.get("direction").equals("CREDIT") &&
            !Set.of("income", "refund", "transfer").contains(type)
        ) throw new IllegalArgumentException("A credit can be income, a refund, or a transfer.");
    }

    void review(Account a, String id, Map<String, String> f) {
        var item = find(a.inbox, id);
        String action = choice(f, "action", "categorize", "ignore", "restore", "match");
        if (action.equals("restore")) {
            if (!item.get("status").equals("ignored")) throw new IllegalArgumentException(
                "Only ignored entries can be restored."
            );
            item.put("status", "pending");
            return;
        }
        if (!item.get("status").equals("pending")) throw new IllegalArgumentException(
            "This entry has already been reviewed. Refresh the page."
        );
        if (action.equals("ignore")) {
            item.put("status", "ignored");
            item.put("note", text(f, "note", 160, false));
            return;
        }
        if (action.equals("match")) {
            var t = find(a.transactions, f.getOrDefault("transactionId", ""));
            checkDirection(item, t.get("type"));
            if (
                !t.get("inboxId").isEmpty() ||
                !t.get("amount").equals(item.get("amount")) ||
                Math.abs(
                    java.time.temporal.ChronoUnit.DAYS.between(
                        LocalDate.parse(t.get("date")),
                        LocalDate.parse(item.get("date"))
                    )
                ) > 3
            ) throw new IllegalArgumentException(
                "Choose an unlinked entry with the same amount within three days."
            );
            t.put("inboxId", item.get("id"));
            t.put("source", item.get("source"));
            t.put("date", item.get("date"));
            t.put("method", item.get("method"));
            item.put("ledgerId", t.get("id"));
            item.put("status", "matched");
            return;
        }
        if (a.transactions.size() >= MAX_ROWS) throw new IllegalArgumentException(
            "Maximum transaction count reached."
        );
        String type = choice(f, "type", "expense", "income", "refund", "transfer");
        checkDirection(item, type);
        var fields = row(
            "date",
            item.get("date"),
            "description",
            item.get("description"),
            "amount",
            item.get("amount"),
            "type",
            type,
            "category",
            choice(f, "category", CATEGORIES),
            "method",
            item.get("method"),
            "notes",
            text(f, "notes", 500, false)
        );
        var t = transaction(fields, id(), item.get("source"), item.get("id"));
        a.transactions.add(t);
        item.put("ledgerId", t.get("id"));
        item.put("status", "categorized");
    }

    void add(Account account, Map<String, String> fields) {
        if (account.transactions.size() >= MAX_ROWS) throw new IllegalArgumentException(
            "Maximum transaction count reached."
        );
        account.transactions.add(transaction(fields, id(), "manual", ""));
    }

    void delete(Account account, String recordId) {
        var old = find(account.transactions, recordId);
        account.transactions.remove(old);
        if (!old.get("inboxId").isEmpty()) {
            var item = find(account.inbox, old.get("inboxId"));
            item.put("status", "ignored");
            item.put("ledgerId", "");
            item.put("note", "Removed from ledger");
        }
    }

    void edit(Account account, String recordId, Map<String, String> fields) {
        var old = find(account.transactions, recordId);
        var next = transaction(fields, recordId, old.get("source"), old.get("inboxId"));
        if (!old.get("inboxId").isEmpty()) {
            for (String key : List.of("amount", "date", "method"))
                if (!next.get(key).equals(old.get(key))) throw new IllegalArgumentException(
                    "Imported date, amount and payment method are fixed. Update the classification instead."
                );
            checkDirection(find(account.inbox, old.get("inboxId")), next.get("type"));
        }
        account.transactions.set(account.transactions.indexOf(old), next);
    }

    void saveBudget(Account account, Map<String, String> fields) {
        String period = month(fields.getOrDefault("month", "")),
            category = fields.getOrDefault("category", "Overall");
        if (
            !category.equals("Overall") && !Arrays.asList(CATEGORIES).contains(category)
        ) throw new IllegalArgumentException("Choose a valid category.");
        String key = period + "_" + category;
        Map<String, String> next = row(
            "id",
            key,
            "month",
            period,
            "category",
            category,
            "amount",
            money(fields.get("amount"))
        );
        account.budgets.removeIf(b -> b.get("id").equals(key));
        account.budgets.add(next);
    }
}
