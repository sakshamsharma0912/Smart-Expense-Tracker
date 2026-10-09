package tracker;

import static tracker.Validation.MAX_ROWS;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Properties;
import java.util.Set;
import java.util.UUID;

/** Imports previous file-based accounts once, without changing the original files. */
final class LegacyAccountMigration {

    private LegacyAccountMigration() {}

    static List<Account> read(Path directory) throws IOException {
        List<Account> result = new ArrayList<>();
        if (!Files.isDirectory(directory)) return result;
        try (var files = Files.list(directory)) {
            for (Path file : files
                .filter(p -> p.toString().endsWith(".properties"))
                .sorted()
                .toList()) {
                Properties p = new Properties();
                try (var reader = Files.newBufferedReader(file)) {
                    p.load(reader);
                }
                Account a = new Account();
                a.id = UUID.fromString(p.getProperty("id")).toString();
                a.name = p.getProperty("name");
                a.email = p.getProperty("email");
                a.role = p.getProperty("role");
                a.salt = p.getProperty("salt");
                a.hash = p.getProperty("hash");
                a.createdAt = p.getProperty("createdAt");
                a.share = Boolean.parseBoolean(p.getProperty("share"));
                a.adapterAllowed = Boolean.parseBoolean(p.getProperty("adapterAllowed", "false"));
                if (
                    !"2".equals(p.getProperty("version")) ||
                    a.name == null ||
                    a.email == null ||
                    a.hash == null ||
                    a.salt == null ||
                    !Set.of("USER", "ADMIN").contains(a.role)
                ) throw new IOException("Invalid previous account file: " + file.getFileName());
                a.transactions = rows(p, "transactions");
                a.inbox = rows(p, "inbox");
                a.budgets = rows(p, "budgets");
                a.audit = rows(p, "audit");
                result.add(a);
            }
        }
        long admins = result
            .stream()
            .filter(a -> a.role.equals("ADMIN"))
            .count();
        if (!result.isEmpty() && admins != 1) throw new IOException(
            "Previous files need exactly one administrator."
        );
        return result;
    }

    private static List<Map<String, String>> rows(Properties p, String kind) throws IOException {
        int count = Integer.parseInt(p.getProperty(kind + ".count", "0"));
        if (count < 0 || count > MAX_ROWS) throw new IOException("Invalid saved record count.");
        List<Map<String, String>> result = new ArrayList<>();
        for (int i = 0; i < count; i++) result.add(new LinkedHashMap<>());
        String prefix = kind + ".";
        for (String key : p.stringPropertyNames())
            if (key.startsWith(prefix) && !key.equals(kind + ".count")) {
                String rest = key.substring(prefix.length());
                int dot = rest.indexOf('.');
                int index = Integer.parseInt(rest.substring(0, dot));
                if (index < 0 || index >= count) throw new IOException(
                    "Invalid saved record index."
                );
                result.get(index).put(rest.substring(dot + 1), p.getProperty(key));
            }
        for (Map<String, String> row : result)
            if (!row.containsKey("id")) throw new IOException("Invalid saved record.");
        return result;
    }
}
