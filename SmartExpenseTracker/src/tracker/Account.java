package tracker;

import static tracker.Records.cloneRows;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/** An account workspace. Deep copies keep failed requests from partially changing saved data. */
public final class Account {

    String id,
        name,
        email,
        role = "USER",
        salt = "",
        hash = "",
        createdAt = Instant.now().toString();
    boolean share = false,
        adapterAllowed = false;
    List<Map<String, String>> transactions = new ArrayList<>(),
        inbox = new ArrayList<>(),
        budgets = new ArrayList<>(),
        audit = new ArrayList<>();

    Account copy() {
        Account a = new Account();
        a.id = id;
        a.name = name;
        a.email = email;
        a.role = role;
        a.salt = salt;
        a.hash = hash;
        a.createdAt = createdAt;
        a.share = share;
        a.adapterAllowed = adapterAllowed;
        a.transactions = cloneRows(transactions);
        a.inbox = cloneRows(inbox);
        a.budgets = cloneRows(budgets);
        a.audit = cloneRows(audit);
        return a;
    }
}
