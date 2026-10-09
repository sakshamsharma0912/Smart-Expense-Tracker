package tracker;

import static tracker.HttpSupport.error;
import static tracker.HttpSupport.jsonResponse;
import static tracker.HttpSupport.parseForm;
import static tracker.HttpSupport.readBody;
import static tracker.PasswordService.constant;
import static tracker.StatementImportService.sameIncoming;
import static tracker.Validation.MAX_ROWS;

import com.sun.net.httpserver.HttpExchange;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Map;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;

/** Authenticates optional loopback adapter events and places approved imports in the review inbox. */
public final class AdapterController {

    private final AccountRepository repository;
    private final TransactionService transactions;
    private final String adapterSecret;

    AdapterController(
        AccountRepository repository,
        TransactionService transactions,
        String adapterSecret
    ) {
        this.repository = repository;
        this.transactions = transactions;
        this.adapterSecret = adapterSecret;
    }

    void handle(HttpExchange ex) throws Exception {
        if (!ex.getRequestMethod().equals("POST")) {
            error(ex, 405, "Method not allowed.");
            return;
        }
        if (adapterSecret == null) {
            error(ex, 503, "No bank adapter is configured.");
            return;
        }
        if (!ex.getRemoteAddress().getAddress().isLoopbackAddress()) {
            error(ex, 403, "The adapter endpoint accepts local server-to-server calls only.");
            return;
        }
        byte[] body = readBody(ex, 32768);
        String stamp = ex.getRequestHeaders().getFirst("X-Event-Timestamp"),
            signature = ex.getRequestHeaders().getFirst("X-Event-Signature");
        try {
            if (
                Math.abs(Instant.now().getEpochSecond() - Long.parseLong(stamp)) > 300
            ) throw new Exception();
        } catch (Exception e) {
            error(ex, 401, "Invalid or expired event timestamp.");
            return;
        }
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(adapterSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        byte[] expected = mac.doFinal(
            (stamp + "." + new String(body, StandardCharsets.UTF_8)).getBytes(
                StandardCharsets.UTF_8
            )
        );
        if (!constant(HexFormat.of().formatHex(expected), signature)) {
            error(ex, 401, "Invalid adapter signature.");
            return;
        }
        Map<String, String> f = parseForm(body);
        Account original = repository.accounts().get(f.get("userId"));
        if (original == null || !original.adapterAllowed) {
            error(ex, 403, "This account has not enabled adapter imports.");
            return;
        }
        Account a = original.copy();
        Map<String, String> entry = transactions.incoming(f, "adapter");
        var old = a.inbox
            .stream()
            .filter(i -> i.get("key").equals(entry.get("key")))
            .findFirst()
            .orElse(null);
        if (old != null) {
            if (!sameIncoming(old, entry)) throw new IllegalArgumentException(
                "Conflicting data for an existing transaction reference."
            );
            jsonResponse(ex, 200, Map.of("accepted", false, "duplicate", true));
            return;
        }
        if (a.inbox.size() >= MAX_ROWS) throw new IllegalArgumentException(
            "Maximum imported-entry count reached."
        );
        a.inbox.add(entry);
        repository.commit(a);
        jsonResponse(ex, 202, Map.of("accepted", true, "duplicate", false));
    }
}
