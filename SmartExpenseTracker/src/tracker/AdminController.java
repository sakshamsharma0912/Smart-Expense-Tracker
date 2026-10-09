package tracker;

import static tracker.HttpSupport.error;
import static tracker.HttpSupport.jsonResponse;
import static tracker.Records.audit;
import static tracker.Records.id;
import static tracker.Validation.date;
import static tracker.Validation.month;

import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Lists account metadata and serves consent-based, read-only tracker views with an access log. */
public final class AdminController {

    private final AccountRepository repository;
    private final WorkspaceResponse response;

    AdminController(AccountRepository repository, WorkspaceResponse response) {
        this.repository = repository;
        this.response = response;
    }

    void admin(HttpExchange ex, String path, String method, Account admin) throws IOException {
        if (!admin.role.equals("ADMIN")) {
            error(ex, 403, "Administrator access is required.");
            return;
        }
        if (!method.equals("GET")) {
            error(ex, 403, "Administrator views are read-only.");
            return;
        }
        if (path.equals("/api/admin/users")) {
            List<Object> list = new ArrayList<>();
            String thisMonth = YearMonth.now(ZoneId.of("Asia/Kolkata")).toString();
            for (Account a : repository.accounts().values())
                if (a.role.equals("USER")) {
                    Map<String, Object> r = new LinkedHashMap<>();
                    r.put("id", a.id);
                    r.put("name", a.name);
                    r.put("email", a.email);
                    r.put("share", a.share);
                    r.put("createdAt", a.createdAt);
                    r.put(
                        "spent",
                        a.share
                            ? a.transactions
                                  .stream()
                                  .filter(
                                      t ->
                                          t.get("type").equals("expense") &&
                                          t.get("date").startsWith(thisMonth)
                                  )
                                  .map(t -> new BigDecimal(t.get("amount")))
                                  .reduce(BigDecimal.ZERO, BigDecimal::add)
                                  .setScale(2)
                                  .toPlainString()
                            : null
                    );
                    r.put(
                        "pending",
                        a.share
                            ? a.inbox
                                  .stream()
                                  .filter(t -> t.get("status").equals("pending"))
                                  .count()
                            : null
                    );
                    list.add(r);
                }
            jsonResponse(ex, 200, Map.of("users", list, "month", thisMonth));
            return;
        }
        String[] p = path.split("/");
        if (p.length == 6 && p[3].equals("users") && p[5].equals("state")) {
            Account target = repository.accounts().get(p[4]);
            if (target == null || target.role.equals("ADMIN") || !target.share) {
                error(ex, 403, "This user has not shared their tracker, or sharing was revoked.");
                return;
            }
            Account next = target.copy();
            boolean recent = next.audit
                .stream()
                .anyMatch(
                    e ->
                        e.get("actor").equals(admin.name) &&
                        e.get("event").equals("Viewed tracker (read-only)") &&
                        Instant.parse(e.get("at")).isAfter(Instant.now().minusSeconds(60))
                );
            if (!recent) {
                audit(next, admin.name, "Viewed tracker (read-only)");
                repository.commit(next);
            }
            response.respond(ex, next, admin);
            return;
        }
        error(ex, 404, "Admin route not found.");
    }
}
