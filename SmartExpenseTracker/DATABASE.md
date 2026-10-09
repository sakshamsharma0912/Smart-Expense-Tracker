# Database

The project uses the unmodified **H2 2.5.252** JDBC driver bundled in `lib/`. Its official documentation and source are linked in `lib/THIRD_PARTY_NOTICES.txt`. The engine runs inside the Java process. It is not exposed as a database server or a web database console.

## Tables

| Table | Contents |
| --- | --- |
| accounts | Account identity, unique email, role, salt, password hash, hash parameters and permissions |
| transactions | Account-scoped ledger entries with exact DECIMAL(11,2) amounts |
| inbox_entries | Statement/adapter references, review status and ledger links |
| budgets | Monthly/category limits, unique within an account |
| activity_log | Permission changes, password changes and read-only admin visits |
| schema_info | Schema version |

Every tracker table references `accounts.id`. All writes use parameterised JDBC statements. A failed snapshot write rolls back the complete request before the in-memory account is replaced. The application serialises requests that touch stored state; an exclusive folder lock prevents two tracker servers from writing the same database. H2 also locks its database file.

## Installed records

The public package excludes `data/expense-tracker.mv.db`. A fresh installation creates one admin, four fictional users, 264 ledger entries, 108 budget rows and eight pending statement entries covering the current and previous two months. Initial passwords are generated at runtime and printed once in the local Java window; no fixed seed passwords are stored in source.

If the database is missing and the data folder has no previous accounts, initialization inserts the accounts and the current/previous two months of tracker data in one transaction. It runs only when the account table is empty. It never resets a non-empty database.

## Previous-version accounts

To preserve previous file-based accounts, stop both servers and copy the previous `users/` folder into a separate data folder, for example `my-records/users/`. Run:

```sh
java --add-modules jdk.httpserver ExpenseServer.java --data-dir=my-records
```

When SQL accounts are empty, `LegacyAccountMigration` validates the previous files and imports them in one transaction. The original salt/hash is retained, so passwords stay the same. The source files are untouched. Migration is skipped when SQL already contains accounts; no seeded accounts are merged into a user's existing accounts.

The separate **Bank imports → Import old tracker data** feature imports the original headerless expenses.csv format into the currently signed-in tracker.

## Inspect SQL locally

Stop the tracker before opening the embedded database from another process:

```sh
java -cp lib/h2-2.5.252.jar org.h2.tools.Shell -url jdbc:h2:./data/expense-tracker -user tracker -password ""
```

Useful read-only queries:

```sql
SELECT name, email, role FROM accounts;
SELECT a.name, COUNT(t.record_id) AS entries
FROM accounts a LEFT JOIN transactions t ON t.account_id = a.id
GROUP BY a.id, a.name;
SELECT report_month, category, amount FROM budgets ORDER BY report_month, category;
```

The SQL database login is local to the engine. It is separate from the website's per-user account/password verification. Copy the closed database file to back it up. A copied preloaded database preserves all installed account identities; recompiling or restarting does not regenerate them.
