package tracker;

import static tracker.PasswordService.token;

import com.sun.net.httpserver.HttpExchange;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;

/** Owns expiring server-side sessions and HttpOnly cookies; rotates cookies on sign-in. */
public final class SessionService {

    private final Map<String, Session> sessions = new HashMap<>();

    private record Session(String uid, Instant expires) {}

    void expire(AccountRepository repository) {
        Instant now = Instant.now();
        sessions.entrySet().removeIf(e -> e.getValue().expires().isBefore(now));
    }

    Account current(HttpExchange ex, AccountRepository repository) {
        Session session = sessions.get(cookie(ex));
        return session == null ? null : repository.accounts().get(session.uid());
    }

    void logout(HttpExchange ex) {
        sessions.remove(cookie(ex));
        ex.getResponseHeaders().add(
            "Set-Cookie",
            "expense_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0"
        );
    }

    String cookie(HttpExchange ex) {
        String s = ex.getRequestHeaders().getFirst("Cookie");
        if (s != null) for (String part : s.split(";")) {
            String[] kv = part.trim().split("=", 2);
            if (kv.length == 2 && kv[0].equals("expense_session")) return kv[1];
        }
        return "";
    }

    void login(HttpExchange ex, Account a) {
        sessions.remove(cookie(ex));
        String t = token();
        sessions.put(t, new Session(a.id, Instant.now().plusSeconds(28800)));
        ex.getResponseHeaders().add(
            "Set-Cookie",
            "expense_session=" + t + "; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800"
        );
    }

    void revokeFor(String accountId) {
        sessions.entrySet().removeIf(e -> e.getValue().uid().equals(accountId));
    }
}
