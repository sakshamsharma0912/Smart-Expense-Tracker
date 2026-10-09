package tracker;

import java.io.IOException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** JDBC repository. Each account snapshot is written in one SQL transaction. */
public final class AccountRepository {

    private final Map<String, Account> users = new LinkedHashMap<>();
    private final FileChannel lockChannel;
    private final FileLock lock;
    private final Connection connection;

    // Left: API field. Right: SQL column. Identifiers are fixed, never supplied by clients.
    private record RowTable(String name, String[][] fields) {}

    private static final RowTable TRANSACTIONS = new RowTable("transactions", new String[][] {
        { "id", "record_id" },
        { "date", "occurred_on" },
        { "description", "description" },
        { "category", "category" },
        { "amount", "amount" },
        { "type", "entry_type" },
        { "method", "method" },
        { "notes", "notes" },
        { "source", "source" },
        { "inboxId", "inbox_id" },
    });
    private static final RowTable INBOX = new RowTable("inbox_entries", new String[][] {
        { "id", "record_id" },
        { "key", "external_key" },
        { "reference", "reference" },
        { "account", "account_label" },
        { "date", "occurred_on" },
        { "description", "description" },
        { "amount", "amount" },
        { "direction", "direction" },
        { "method", "method" },
        { "source", "source" },
        { "suggested", "suggested" },
        { "status", "status" },
        { "ledgerId", "ledger_id" },
        { "note", "note" },
        { "receivedAt", "received_at" },
    });
    private static final RowTable BUDGETS = new RowTable("budgets", new String[][] {
        { "id", "record_id" },
        { "month", "report_month" },
        { "category", "category" },
        { "amount", "amount" },
    });
    private static final RowTable AUDIT = new RowTable("activity_log", new String[][] {
        { "id", "record_id" },
        { "at", "happened_at" },
        { "actor", "actor" },
        { "event", "event" },
    });

    AccountRepository(Path data) throws Exception {
        Path directory = data.toAbsolutePath().normalize();
        Files.createDirectories(directory);
        lockChannel = FileChannel.open(
            directory.resolve(".server.lock"),
            StandardOpenOption.CREATE,
            StandardOpenOption.WRITE
        );
        lock = lockChannel.tryLock();
        if (lock == null) {
            lockChannel.close();
            throw new IOException("Another tracker is using this database folder.");
        }
        Connection opened = null;
        try {
            Class.forName("org.h2.Driver");
            opened = DriverManager.getConnection(
                "jdbc:h2:file:" + directory.resolve("expense-tracker") + ";DB_CLOSE_ON_EXIT=FALSE",
                "tracker",
                ""
            );
            connection = opened;
            String schema = Files.readString(Path.of("database", "schema.sql"));
            try (var statement = connection.createStatement()) {
                for (String sql : schema.split(";")) if (!sql.isBlank()) statement.execute(sql);
                try (
                    ResultSet version = statement.executeQuery("SELECT version FROM schema_info")
                ) {
                    if (
                        !version.next() || version.getInt(1) != 1 || version.next()
                    ) throw new IOException("Unsupported database schema version.");
                }
            }
            loadAccounts();
            if (users.isEmpty()) {
                List<Account> legacy = LegacyAccountMigration.read(directory.resolve("users"));
                if (!legacy.isEmpty()) commitAll(legacy);
            }
            validateOwner();
        } catch (Exception e) {
            if (opened != null) opened.close();
            lock.release();
            lockChannel.close();
            throw e;
        }
    }

    private void loadAccounts() throws SQLException {
        try (
            var statement = connection.createStatement();
            ResultSet rows = statement.executeQuery(
                "SELECT * FROM accounts ORDER BY created_at, id"
            )
        ) {
            while (rows.next()) {
                Account a = new Account();
                a.id = rows.getString("id");
                a.name = rows.getString("name");
                a.email = rows.getString("email");
                a.role = rows.getString("role");
                a.salt = rows.getString("password_salt");
                a.hash = rows.getString("password_hash");
                a.createdAt = rows.getString("created_at");
                a.share = rows.getBoolean("share_tracker");
                a.adapterAllowed = rows.getBoolean("adapter_allowed");
                a.transactions = readRows(a.id, TRANSACTIONS);
                a.inbox = readRows(a.id, INBOX);
                a.budgets = readRows(a.id, BUDGETS);
                a.audit = readRows(a.id, AUDIT);
                users.put(a.id, a);
            }
        }
    }

    private void validateOwner() throws IOException {
        long admins = users
            .values()
            .stream()
            .filter(a -> a.role.equals("ADMIN"))
            .count();
        if (admins > 1 || (!users.isEmpty() && admins != 1)) throw new IOException(
            "The database must contain exactly one administrator."
        );
    }

    private List<Map<String, String>> readRows(String account, RowTable table) throws SQLException {
        List<Map<String, String>> result = new ArrayList<>();
        try (
            PreparedStatement query = connection.prepareStatement(
                "SELECT * FROM " + table.name() + " WHERE account_id=? ORDER BY row_index"
            )
        ) {
            query.setString(1, account);
            try (ResultSet rows = query.executeQuery()) {
                while (rows.next()) {
                    Map<String, String> row = new LinkedHashMap<>();
                    for (String[] field : table.fields())
                        row.put(field[0], rows.getString(field[1]));
                    result.add(row);
                }
            }
        }
        return result;
    }

    private void replaceRows(String account, RowTable table, List<Map<String, String>> rows)
        throws SQLException {
        try (
            PreparedStatement delete = connection.prepareStatement(
                "DELETE FROM " + table.name() + " WHERE account_id=?"
            )
        ) {
            delete.setString(1, account);
            delete.executeUpdate();
        }
        List<String> columns = new ArrayList<>(List.of("account_id", "row_index"));
        for (String[] field : table.fields()) columns.add(field[1]);
        String placeholders = String.join(",", java.util.Collections.nCopies(columns.size(), "?"));
        try (
            PreparedStatement insert = connection.prepareStatement(
                "INSERT INTO " +
                    table.name() +
                    "(" +
                    String.join(",", columns) +
                    ") VALUES(" +
                    placeholders +
                    ")"
            )
        ) {
            for (int i = 0; i < rows.size(); i++) {
                insert.setString(1, account);
                insert.setInt(2, i);
                for (int j = 0; j < table.fields().length; j++) insert.setString(
                    j + 3,
                    rows.get(i).get(table.fields()[j][0])
                );
                insert.addBatch();
            }
            insert.executeBatch();
        }
    }

    void commit(Account a) throws IOException {
        commitAll(List.of(a));
    }

    void commitAll(List<Account> accounts) throws IOException {
        try {
            connection.setAutoCommit(false);
            for (Account a : accounts) {
                try (
                    PreparedStatement save = connection.prepareStatement(
                        "MERGE INTO accounts(id,name,email,role,password_salt,password_hash,created_at,share_tracker,adapter_allowed) " +
                            "KEY(id) VALUES(?,?,?,?,?,?,?,?,?)"
                    )
                ) {
                    save.setString(1, a.id);
                    save.setString(2, a.name);
                    save.setString(3, a.email);
                    save.setString(4, a.role);
                    save.setString(5, a.salt);
                    save.setString(6, a.hash);
                    save.setString(7, a.createdAt);
                    save.setBoolean(8, a.share);
                    save.setBoolean(9, a.adapterAllowed);
                    save.executeUpdate();
                }
                replaceRows(a.id, TRANSACTIONS, a.transactions);
                replaceRows(a.id, INBOX, a.inbox);
                replaceRows(a.id, BUDGETS, a.budgets);
                replaceRows(a.id, AUDIT, a.audit);
            }
            connection.commit();
            for (Account a : accounts) users.put(a.id, a);
        } catch (SQLException e) {
            try {
                connection.rollback();
            } catch (SQLException rollback) {
                e.addSuppressed(rollback);
            }
            throw new IOException("Database write failed; the request was rolled back.", e);
        } finally {
            try {
                connection.setAutoCommit(true);
            } catch (SQLException e) {
                throw new IOException("Could not restore the database connection.", e);
            }
        }
    }

    Account owner() {
        return users
            .values()
            .stream()
            .filter(a -> a.role.equals("ADMIN"))
            .findFirst()
            .orElse(null);
    }

    Map<String, Account> accounts() {
        return users;
    }

    public void close() throws IOException {
        try {
            connection.close();
        } catch (SQLException e) {
            throw new IOException(e);
        } finally {
            lock.release();
            lockChannel.close();
        }
    }
}
