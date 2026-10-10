# Database configuration and migration

Changing a JDBC URL switches the target database. It does not move existing data automatically. The V4 migration described below is a separate, explicit, one-time step.

## Fresh H2 project

The default application.yml uses:

    jdbc:h2:file:./data/expense-v5;DB_CLOSE_ON_EXIT=FALSE

Flyway creates the V5 schema and Hibernate validates it. The original V4 file is never opened during an ordinary launch. Do not point V5's main datasource at **data/expense-tracker.mv.db** from V4: it has a different schema.

For local backup, stop V5 and copy its data directory, including the database and jwt.key when using the locally generated signing key. Restore into the same V5 application version before applying later migrations.

## PostgreSQL

Create a dedicated database/user using your PostgreSQL administration connection:

    CREATE ROLE expense_app LOGIN PASSWORD '<choose a strong database password>';
    CREATE DATABASE expense_tracker OWNER expense_app;

In your shell, configure the application:

    export SPRING_PROFILES_ACTIVE=postgres
    export DATABASE_URL='jdbc:postgresql://127.0.0.1:5432/expense_tracker'
    export DB_USERNAME='expense_app'
    export DB_PASSWORD='<your database password>'
    export JWT_SECRET='<Base64 encoding of at least 32 random bytes>'
    export COOKIE_SECURE=false
    sh run.sh

The COOKIE_SECURE=false setting is for local HTTP testing. A shared deployment over HTTPS should use true, which is the profile's default.

Use a database service's documented TLS options for a remote connection, for example:

    jdbc:postgresql://db.example.com:5432/expense_tracker?sslmode=verify-full

Install/configure that service's trusted CA as required by its driver. Keep secrets outside version control.

## MySQL

Use MySQL 8.4 or later with InnoDB and UTF-8:

    CREATE DATABASE expense_tracker CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
    CREATE USER 'expense_app'@'localhost' IDENTIFIED BY '<choose a strong database password>';
    GRANT ALL PRIVILEGES ON expense_tracker.* TO 'expense_app'@'localhost';

The host restriction above is for local development; set the application's actual trusted host for a separate database server.

    export SPRING_PROFILES_ACTIVE=mysql
    export DATABASE_URL='jdbc:mysql://127.0.0.1:3306/expense_tracker?serverTimezone=UTC'
    export DB_USERNAME='expense_app'
    export DB_PASSWORD='<your database password>'
    export JWT_SECRET='<Base64 encoding of at least 32 random bytes>'
    export COOKIE_SECURE=false
    sh run.sh

For a remote MySQL service, configure its TLS requirements, including sslMode=VERIFY_IDENTITY and its trusted CA.

Both drivers and Flyway vendor modules are included in pom.xml. The shared SQL uses explicit table-level foreign keys, DECIMAL monetary values, UUID strings and portable DATE/TIMESTAMP types. Hibernate operates with UTC timestamps.

For a production installation, separate schema-migration privileges from the application account's normal read/write privileges once deployment migrations are managed independently. The commands above grant the app the DDL permissions needed for this college project's automatic Flyway startup.

## Migrate an existing V4 H2 database

The packaged **V4MigrationService** reads accounts, transactions, inbox_entries, budgets and activity_log from V4's normalized H2 schema. It uses V4's database user **tracker** and the empty password by default. If your V4 credentials differ, configure V4_H2_USERNAME/V4_H2_PASSWORD.

1. Stop V4 completely and back up its original data directory.
2. Use a **new V5 installation/target database with no accounts or financial records**. Do not register a user first.
3. Set the absolute path to V4's H2 database, with or without the .mv.db suffix.
4. Start V5. Its migration runner copies the records into the selected V5 datasource in one transaction.
5. After the success message, stop V5, remove V4_H2_PATH, and restart normally.
6. Sign in with the original User/Admin role and password. Compare account counts, monthly spending, inbox links, budgets and audit history with your backup.

Linux/macOS example, migrating into fresh V5 H2:

    export V4_H2_PATH='/absolute/path/Smart_Expense_Tracker_V4/data/expense-tracker'
    sh run.sh

Stop after migration completes, then:

    unset V4_H2_PATH
    sh run.sh

PowerShell:

    $env:V4_H2_PATH = 'C:\absolute\path\Smart_Expense_Tracker_V4\data\expense-tracker'
    .\run.bat

Stop after success, then:

    Remove-Item Env:V4_H2_PATH
    .\run.bat

To migrate V4 directly into an empty PostgreSQL/MySQL target, set that profile's connection variables together with V4_H2_PATH before the first start. The source stays H2; the target is the selected JPA datasource.

The migrator:

- Opens the source with IFEXISTS=TRUE and ACCESS_MODE_DATA=r; it never edits the old schema or copies V4 files into the target directory.
- Refuses an occupied target instead of merging or deleting it.
- Preserves user IDs, names, emails, roles, sharing preferences and creation times.
- Uses deterministic owner-qualified UUIDs for legacy record IDs so identical record IDs from different owners do not collide.
- Remaps transaction ↔ inbox links consistently and keeps V4 account-label/reference import keys.
- Preserves transaction dates, categories, methods, types, notes, budgets and audit entries.
- Sets newly introduced recorded tax values to zero; V4 had no explicit tax field.
- Stores existing PBKDF2 hashes in a marked compatibility format. The first successful login rehashes the password into the current Spring Security format.
- Does not migrate session tokens or optional adapter consent; users log in again and the V5 adapter remains disabled.

A parsing/schema/link/password-setting error rolls back all target row inserts. Flyway's already-created empty target tables remain. Fix the source/configuration and retry against that empty target. The original V4 files remain available for rollback.

Leaving V4_H2_PATH set after a successful migration causes the next launch to refuse the now-occupied target. Remove it as part of step 5. The provided tests migrate a synthetic V4 database. No personal database is included in this public source archive.

## Moving an already-used V5 H2 database to another database

The provided migrator accepts **V4 schema**, not V5 schema. For an already-populated V5 database:

1. Stop writes and take a complete backup.
2. Initialize a fresh target with the same versioned Flyway migrations.
3. Export the app tables with a migration tool or a dedicated JDBC ETL job, preserving IDs and DECIMAL values.
4. Import users before their transactions, budgets, inbox and audit entries; validate counts and owner-scoped monthly totals. Regenerate refresh tokens through fresh login.
5. Reuse the persistent signing secret if access-token continuity is desired, or intentionally rotate it and require all users to sign in.
6. Update the connection/profile configuration and verify in staging before switching the installation.

Do not import an H2 SCRIPT dump blindly into another database: identity, quoting, timestamp and vendor-specific DDL differences need normalization. This second migration is guidance; a generic V5 cross-database ETL command is not included.

## HTTPS and reverse proxy

The local default binds to 127.0.0.1. For a shared installation, keep a trusted reverse proxy or controlled ingress in front of the application, configure its TLS certificate, and set:

    COOKIE_SECURE=true
    FORWARD_HEADERS_STRATEGY=framework

The trusted proxy must remove untrusted Forwarded/X-Forwarded-* headers and provide the external scheme/host so the refresh endpoint's origin comparison sees the public origin. Do not expose a forwarded-header-trusting application port directly to untrusted traffic.

Only change BIND_ADDRESS when your intended network/container setup requires it. The frontend and backend should remain on the same origin.

## Scaling beyond the college project

Repository/database normalization is complete. The existing workspace response intentionally remains compatible with V4 and contains a user's full ledger. For large datasets, add owner-scoped Pageable queries and server-side search/summary endpoints, replace in-memory XLSX generation with SXSSFWorkbook/streamed exports, and add load tests. Rotate/clean up expired refresh rows with a scheduled maintenance job, and configure gateway login throttling before operating a shared public service.

PostgreSQL and MySQL configurations are supplied but were not executed against external database servers during the project verification. Test the selected driver, Flyway migration, foreign keys, locking, Unicode data, timezone behavior and report endpoints in your environment before switching live data.

## PocketSync recurring schedules

V2 adds recurring_transactions and recurring_occurrences through Flyway. Existing V5 users, budgets, transactions, inbox and audit data remain intact. The new entities and repositories use the same relational database profiles. Stop the server and back up the data folder before updating. H2, PostgreSQL and MySQL migration paths still require their corresponding runtime configuration; only H2 was executed during this upgrade.
