package tracker;

import static tracker.HttpSupport.error;
import static tracker.HttpSupport.form;
import static tracker.HttpSupport.jsonResponse;
import static tracker.Records.audit;
import static tracker.Validation.text;

import com.sun.net.httpserver.HttpExchange;
import java.util.Map;
import java.util.Set;

/** Routes authenticated requests; services own validation and state changes. Called under the server state lock. */
public final class ApiController {

    private final AccountRepository repository;
    private final SessionService sessions;
    private final AuthenticationService authentication;
    private final AdminController admin;
    private final TransactionService transactions;
    private final StatementImportService imports;
    private final WorkspaceResponse response;

    ApiController(
        AccountRepository repository,
        SessionService sessions,
        AuthenticationService authentication,
        AdminController admin,
        TransactionService transactions,
        StatementImportService imports,
        WorkspaceResponse response
    ) {
        this.repository = repository;
        this.sessions = sessions;
        this.authentication = authentication;
        this.admin = admin;
        this.transactions = transactions;
        this.imports = imports;
        this.response = response;
    }

    void handle(HttpExchange ex, String path, String method) throws Exception {
        sessions.expire(repository);
        if (path.equals("/api/public") && method.equals("GET")) {
            jsonResponse(
                ex,
                200,
                Map.of(
                    "setupRequired",
                    repository.owner() == null,
                    "adminName",
                    repository.owner() == null ? "Project owner" : repository.owner().name,
                    "liveBankConnected",
                    false
                )
            );
            return;
        }
        if (
            Set.of("/api/login", "/api/register", "/api/setup").contains(path) &&
            method.equals("POST")
        ) {
            authentication.authenticate(ex, path, form(ex));
            return;
        }
        if (path.equals("/api/demo") || path.equals("/api/simulate")) {
            error(ex, 404, "API route not found.");
            return;
        }
        Account current = sessions.current(ex, repository);
        if (current == null) {
            error(ex, 401, "Please sign in.");
            return;
        }
        if (path.equals("/api/logout") && method.equals("POST")) {
            sessions.logout(ex);
            jsonResponse(ex, 200, Map.of("ok", true));
            return;
        }
        if (path.startsWith("/api/admin/")) {
            admin.admin(ex, path, method, current);
            return;
        }
        if (path.equals("/api/state") && method.equals("GET")) {
            response.respond(ex, current, current);
            return;
        }
        if (path.equals("/api/password") && method.equals("PUT")) {
            authentication.changePassword(ex, current, form(ex));
            return;
        }
        Account a = current.copy();
        Map<String, String> f =
            method.equals("DELETE") || method.equals("GET") ? Map.of() : form(ex);
        String[] parts = path.split("/");
        String kind = parts.length > 2 ? parts[2] : "",
            rid = parts.length > 3 ? parts[3] : "";
        if (path.equals("/api/profile") && method.equals("PUT")) {
            a.name = text(f, "name", 60, true);
            boolean sharing = "true".equals(f.get("share"));
            if (sharing != a.share) audit(
                a,
                a.name,
                sharing ? "Enabled admin viewing" : "Revoked admin viewing"
            );
            a.share = sharing;
        } else if (path.equals("/api/adapter-consent") && method.equals("PUT")) {
            boolean allowed = "true".equals(f.get("allowed"));
            if (allowed != a.adapterAllowed) audit(
                a,
                a.name,
                allowed ? "Enabled local adapter imports" : "Revoked local adapter imports"
            );
            a.adapterAllowed = allowed;
        } else if (kind.equals("transactions") && parts.length <= 4) {
            if (rid.isEmpty() && method.equals("POST")) transactions.add(a, f);
            else if (!rid.isEmpty() && method.equals("DELETE")) transactions.delete(a, rid);
            else if (!rid.isEmpty() && method.equals("PUT")) transactions.edit(a, rid, f);
            else {
                error(ex, 405, "Method not allowed.");
                return;
            }
        } else if (path.equals("/api/budgets") && method.equals("PUT")) {
            transactions.saveBudget(a, f);
        } else if (kind.equals("inbox") && parts.length == 4 && method.equals("PUT")) {
            transactions.review(a, rid, f);
        } else if (path.equals("/api/import/preview") && method.equals("POST")) {
            ImportResult r = imports.importRows(a, f);
            jsonResponse(
                ex,
                200,
                Map.of("rows", r.rows(), "duplicates", r.duplicates(), "newCount", r.rows().size())
            );
            return;
        } else if (path.equals("/api/import/commit") && method.equals("POST")) {
            ImportResult r = imports.importRows(a, f);
            a.inbox.addAll(r.rows());
            audit(a, a.name, "Imported " + r.rows().size() + " statement entries");
            repository.commit(a);
            jsonResponse(
                ex,
                200,
                Map.of(
                    "state",
                    response.payload(a, a),
                    "imported",
                    r.rows().size(),
                    "duplicates",
                    r.duplicates()
                )
            );
            return;
        } else if (path.equals("/api/import/legacy") && method.equals("POST")) {
            int added = imports.legacyImport(a, f);
            repository.commit(a);
            jsonResponse(ex, 200, Map.of("state", response.payload(a, a), "imported", added));
            return;
        } else {
            error(ex, 404, "API route not found.");
            return;
        }
        repository.commit(a);
        response.respond(ex, a, a);
    }
}
