package tracker;

import static tracker.Records.*;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

/** First-install data: five persistent accounts, including four fictional tracker owners. */
public final class SeedDataService {

    private final AccountRepository repository;
    private final TransactionService transactions;
    private final List<String> initialLogins = new ArrayList<>();

    SeedDataService(AccountRepository repository, TransactionService transactions) {
        this.repository = repository;
        this.transactions = transactions;
    }

    void initialize() throws Exception {
        if (!repository.accounts().isEmpty()) return;
        List<Account> accounts = new ArrayList<>();
        accounts.add(
            account("Workspace Admin", "admin@tracker.local", "ADMIN")
        );
        String[][] people = {
            { "Aarav Mehta", "aarav", "0.84" },
            { "Isha Verma", "isha", "1.12" },
            { "Rohan Singh", "rohan", "0.68" },
            { "Meera Kapoor", "meera", "1.03" },
        };
        for (String[] person : people) {
            Account a = account(person[0], person[1] + "@tracker.local", "USER");
            a.share = true;
            populate(a, person[1], new BigDecimal(person[2]));
            audit(a, a.name, "Initial tracker records added; admin viewing enabled");
            accounts.add(a);
        }
        repository.commitAll(accounts);
        System.out.println("First-install passwords generated locally. Save them privately now;");
        System.out.println("they will not be printed again or included in project files.");
        initialLogins.forEach(System.out::println);
        initialLogins.clear();
    }

    private Account account(String name, String email, String role)
        throws Exception {
        String password = PasswordService.token();
        initialLogins.add("INITIAL_LOGIN " + email + " " + password);
        Account a = new Account();
        a.id = id();
        a.name = name;
        a.email = email;
        a.role = role;
        a.salt = PasswordService.newSalt();
        a.hash = PasswordService.passwordHash(password, a.salt);
        audit(a, name, "Account created");
        return a;
    }

    private String scaled(String amount, BigDecimal factor) {
        return new BigDecimal(amount)
            .multiply(factor)
            .setScale(2, RoundingMode.HALF_UP)
            .toPlainString();
    }

    private void populate(Account a, String handle, BigDecimal scale) {
        LocalDate today = LocalDate.now(ZoneId.of("Asia/Kolkata"));
        String[][] expenses = {
            { "College canteen", "Food", "140", "UPI" },
            { "Metro recharge", "Travel", "500", "UPI" },
            { "Reference books", "Education", "720", "Card" },
            { "Weekly groceries", "Food", "1120", "UPI" },
            { "Mobile recharge", "Bills", "299", "UPI" },
            { "Lunch with friends", "Food", "360", "Cash" },
            { "Stationery", "Education", "180", "Cash" },
            { "Movie tickets", "Entertainment", "480", "Card" },
            { "Bus fare", "Travel", "85", "Cash" },
            { "Pharmacy", "Health", "245", "UPI" },
            { "Clothes", "Shopping", "1299", "Card" },
            { "Coffee", "Food", "160", "UPI" },
            { "Internet bill", "Bills", "599", "Bank" },
            { "Auto ride", "Travel", "150", "Cash" },
            { "Course subscription", "Education", "899", "Card" },
            { "Dinner", "Food", "420", "UPI" },
            { "Streaming subscription", "Entertainment", "199", "Card" },
            { "Desk essentials", "Shopping", "680", "UPI" },
            { "Weekend groceries", "Food", "850", "UPI" },
            { "Laundry", "Other", "210", "Cash" },
        };
        for (int offset = -2; offset <= 0; offset++) {
            YearMonth period = YearMonth.from(today).plusMonths(offset);
            int last = offset == 0 ? today.getDayOfMonth() : period.lengthOfMonth();
            BigDecimal factor = scale.multiply(
                new BigDecimal(offset == -2 ? "0.94" : offset == -1 ? "1.08" : "1.00")
            );
            for (int i = 0; i < expenses.length; i++) {
                String[] e = expenses[i];
                int day = 1 + (i * Math.max(1, last - 1)) / expenses.length;
                a.transactions.add(
                    transactions.transaction(
                        row(
                            "date",
                            period.atDay(Math.min(day, last)).toString(),
                            "description",
                            e[0],
                            "category",
                            e[1],
                            "amount",
                            scaled(e[2], factor),
                            "type",
                            "expense",
                            "method",
                            e[3],
                            "notes",
                            ""
                        ),
                        id(),
                        "manual",
                        ""
                    )
                );
            }
            a.transactions.add(
                transactions.transaction(
                    row(
                        "date",
                        period.atDay(1).toString(),
                        "description",
                        "Monthly allowance",
                        "category",
                        "Other",
                        "amount",
                        scaled("16000", scale),
                        "type",
                        "income",
                        "method",
                        "Bank",
                        "notes",
                        ""
                    ),
                    id(),
                    "manual",
                    ""
                )
            );
            a.transactions.add(
                transactions.transaction(
                    row(
                        "date",
                        period.atDay(Math.min(5, last)).toString(),
                        "description",
                        "Shopping refund",
                        "category",
                        "Shopping",
                        "amount",
                        scaled("250", factor),
                        "type",
                        "refund",
                        "method",
                        "Card",
                        "notes",
                        ""
                    ),
                    id(),
                    "manual",
                    ""
                )
            );
            for (String[] budget : new String[][] {
                { "Overall", "14000" },
                { "Food", "3800" },
                { "Travel", "1600" },
                { "Shopping", "2800" },
                { "Education", "2500" },
                { "Bills", "1500" },
                { "Health", "800" },
                { "Entertainment", "1200" },
                { "Other", "800" },
            })
                transactions.saveBudget(
                    a,
                    row(
                        "month",
                        period.toString(),
                        "category",
                        budget[0],
                        "amount",
                        scaled(budget[1], scale)
                    )
                );
        }
        for (String[] entry : new String[][] {
            { "CAFE", "Campus Cafe", "185", "DEBIT", "UPI" },
            { "METRO", "Metro top-up", "300", "DEBIT", "UPI" },
        })
            a.inbox.add(
                transactions.incoming(
                    row(
                        "transaction_id",
                        handle.toUpperCase() + "-" + today + "-" + entry[0],
                        "date",
                        today.toString(),
                        "description",
                        entry[1],
                        "amount",
                        scaled(entry[2], scale),
                        "direction",
                        entry[3],
                        "method",
                        entry[4],
                        "account",
                        "Personal account"
                    ),
                    "statement"
                )
            );
    }
}
