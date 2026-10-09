package tracker;

import static tracker.HttpSupport.jsonResponse;
import static tracker.Records.audit;
import static tracker.Records.id;

import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.util.Map;

/** Builds authorised state responses and distinguishes the viewer from the tracker owner. */
public final class WorkspaceResponse {

    private final AccountRepository repository;
    private final boolean adapterConfigured;

    WorkspaceResponse(AccountRepository repository, boolean adapterConfigured) {
        this.repository = repository;
        this.adapterConfigured = adapterConfigured;
    }

    Map<String, Object> payload(Account a, Account viewer) {
        return Map.of(
            "runtime",
            "java",
            "profile",
            Map.of(
                "id",
                a.id,
                "name",
                a.name,
                "email",
                a.email,
                "role",
                a.role,
                "share",
                a.share,
                "createdAt",
                a.createdAt
            ),
            "viewer",
            Map.of(
                "id",
                viewer.id,
                "name",
                viewer.name,
                "role",
                viewer.role,
                "readOnly",
                !a.id.equals(viewer.id)
            ),
            "transactions",
            a.transactions,
            "inbox",
            a.inbox,
            "budgets",
            a.budgets,
            "audit",
            a.audit,
            "integration",
            Map.of(
                "live",
                false,
                "adapterConfigured",
                adapterConfigured,
                "allowed",
                a.adapterAllowed
            ),
            "adminName",
            repository.owner() == null ? "Project owner" : repository.owner().name
        );
    }

    void respond(HttpExchange ex, Account a, Account viewer) throws IOException {
        jsonResponse(ex, 200, payload(a, viewer));
    }
}
