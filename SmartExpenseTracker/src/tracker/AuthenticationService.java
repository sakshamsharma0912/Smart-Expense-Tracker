package tracker;

import static tracker.HttpSupport.error;
import static tracker.PasswordService.constant;
import static tracker.PasswordService.newSalt;
import static tracker.PasswordService.passwordHash;
import static tracker.Records.audit;
import static tracker.Records.id;
import static tracker.Validation.text;

import com.sun.net.httpserver.HttpExchange;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Base64;
import java.util.Deque;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Handles local owner setup, non-promotable user registration and throttled password login. */
public final class AuthenticationService {

    private final AccountRepository repository;
    private final SessionService sessions;
    private final WorkspaceResponse response;
    private final String setupKey;
    private final Map<String, Deque<Instant>> failures = new HashMap<>();

    AuthenticationService(
        AccountRepository repository,
        SessionService sessions,
        WorkspaceResponse response,
        String setupKey
    ) {
        this.repository = repository;
        this.sessions = sessions;
        this.response = response;
        this.setupKey = setupKey;
    }

    void changePassword(HttpExchange ex, Account current, Map<String, String> fields)
        throws Exception {
        String oldPassword = fields.getOrDefault("currentPassword", "");
        String nextPassword = fields.getOrDefault("newPassword", "");
        if (
            oldPassword.length() > 128 ||
            !constant(passwordHash(oldPassword, current.salt), current.hash)
        ) {
            error(ex, 400, "Your current password is incorrect.");
            return;
        }
        if (nextPassword.length() < 10 || nextPassword.length() > 128) {
            throw new IllegalArgumentException("Use a new password with 10 to 128 characters.");
        }
        if (nextPassword.equals(oldPassword)) throw new IllegalArgumentException(
            "Choose a different new password."
        );
        Account updated = current.copy();
        updated.salt = newSalt();
        updated.hash = passwordHash(nextPassword, updated.salt);
        audit(updated, updated.name, "Password changed; other sessions signed out");
        repository.commit(updated);
        sessions.revokeFor(updated.id);
        sessions.login(ex, updated);
        response.respond(ex, updated, updated);
    }

    void authenticate(HttpExchange ex, String path, Map<String, String> f) throws Exception {
        String ip = ex.getRemoteAddress().getAddress().getHostAddress();
        Deque<Instant> bad = failures.computeIfAbsent(ip, k -> new ArrayDeque<>());
        while (!bad.isEmpty() && bad.peekFirst().isBefore(Instant.now().minusSeconds(900)))
            bad.removeFirst();
        if (bad.size() >= 10) {
            error(ex, 429, "Too many sign-in attempts. Try again in 15 minutes.");
            return;
        }
        String email = text(f, "email", 120, true).toLowerCase(Locale.ROOT),
            password = f.getOrDefault("password", "");
        if (!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw new IllegalArgumentException(
            "Enter a valid email address."
        );
        if (password.length() < 10 || password.length() > 128) throw new IllegalArgumentException(
            "Use a password with 10 to 128 characters."
        );
        Account existing = repository
            .accounts()
            .values()
            .stream()
            .filter(a -> a.email.equals(email))
            .findFirst()
            .orElse(null);
        if (path.equals("/api/login")) {
            String loginRole = f.getOrDefault("loginRole", "");
            if (!java.util.Set.of("USER", "ADMIN").contains(loginRole)) {
                throw new IllegalArgumentException("Choose user login or admin login.");
            }
            String salt =
                existing == null ? Base64.getEncoder().encodeToString(new byte[16]) : existing.salt;
            String computed = passwordHash(password, salt);
            if (
                existing == null ||
                !constant(computed, existing.hash) ||
                !existing.role.equals(loginRole)
            ) {
                bad.addLast(Instant.now());
                error(ex, 401, "Email, password or login type is incorrect.");
                return;
            }
            bad.clear();
            sessions.login(ex, existing);
            response.respond(ex, existing, existing);
            return;
        }
        boolean setup = path.equals("/api/setup");
        if (setup) {
            if (
                repository.owner() != null ||
                !ex.getRemoteAddress().getAddress().isLoopbackAddress() ||
                !constant(setupKey, f.get("setupKey"))
            ) {
                error(
                    ex,
                    403,
                    "Owner setup requires the current setup link on the server computer."
                );
                return;
            }
        } else if (repository.owner() == null) {
            error(ex, 409, "The owner must finish setup on the server computer first.");
            return;
        }
        if (existing != null) throw new IllegalArgumentException(
            "This email already has an account. Sign in instead."
        );
        if (
            repository.accounts().values().stream().count() >= 200
        ) throw new IllegalArgumentException("Maximum 200 local accounts reached.");
        if (!setup && !"true".equals(f.get("noticeAccepted"))) throw new IllegalArgumentException(
            "Please acknowledge the account privacy notice."
        );
        Account a = new Account();
        a.id = id();
        a.name = text(f, "name", 60, true);
        a.email = email;
        a.role = setup ? "ADMIN" : "USER";
        a.share = !setup && "true".equals(f.get("share"));
        a.salt = newSalt();
        a.hash = passwordHash(password, a.salt);
        audit(
            a,
            a.name,
            setup
                ? "Owner account created"
                : a.share
                  ? "Account created; admin viewing enabled"
                  : "Account created; tracker private"
        );
        repository.commit(a);
        sessions.login(ex, a);
        response.respond(ex, a, a);
    }
}
