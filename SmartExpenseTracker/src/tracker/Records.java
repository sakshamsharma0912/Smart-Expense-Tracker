package tracker;

import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** Small helpers for the version-2 row schema and access activity log. */
public final class Records {

    private Records() {}

    static List<Map<String, String>> cloneRows(List<Map<String, String>> rows) {
        List<Map<String, String>> n = new ArrayList<>();
        for (var r : rows) n.add(new LinkedHashMap<>(r));
        return n;
    }

    static String id() {
        return UUID.randomUUID().toString();
    }

    static Map<String, String> row(String... p) {
        Map<String, String> r = new LinkedHashMap<>();
        for (int i = 0; i < p.length; i += 2) r.put(p[i], p[i + 1]);
        return r;
    }

    static Map<String, String> find(List<Map<String, String>> list, String id) {
        return list
            .stream()
            .filter(r -> id.equals(r.get("id")))
            .findFirst()
            .orElseThrow(() -> new IllegalArgumentException("Record not found in this workspace."));
    }

    static void audit(Account a, String actor, String event) {
        a.audit.add(
            0,
            row("id", id(), "at", Instant.now().toString(), "actor", actor, "event", event)
        );
        if (a.audit.size() > 100) a.audit.remove(a.audit.size() - 1);
    }
}
