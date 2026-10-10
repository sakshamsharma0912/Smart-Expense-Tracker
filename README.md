# PocketSync

**Spend smart. Stay in sync.**

A full-stack personal finance application built with Java 17, Spring Boot, Spring Security, JPA and an embedded H2 database. Its responsive HTML/CSS/JavaScript interface uses a midnight navy theme with sapphire accents.

## Run on Windows

1. Install a **JDK 17 or newer** and ensure `java` is available in your terminal.
2. Extract this ZIP into a normal folder. This public source package contains no account database. The server creates its local `data` folder on first launch.
3. Double-click **run.bat**. The first build downloads Maven and the pinned Java dependencies; an internet connection is needed for that build.
4. Keep the Java window open and visit **http://localhost:8080**.
5. Choose **Create account** to register a private normal-user account, then sign in using **User login**. To configure an administrator, follow the setup below before registering with that email.

This GitHub-ready package contains the complete application source, migration SQL, tests and fictional statement examples. It deliberately contains **no existing accounts, account passwords, financial database or signing key**. A fresh installation starts with empty trackers. Add transactions, budgets and subscriptions through the app, or import a CSV. The separately supplied private PocketSync package retains its existing accounts and populated records for local use.

On macOS/Linux:

```sh
chmod +x mvnw run.sh
./run.sh
```

If port 8080 is occupied, set `PORT` before starting. For example, in a Windows command prompt:

```bat
set PORT=8081
run.bat
```

After a successful build you can also run `java -jar target/pocketsync.jar`. Open the page through the server; opening `index.html` directly cannot call the API.

## Set up an administrator locally

The source contains no default administrator credentials. For a fresh installation, open PowerShell in the project folder and run the following. Enter your own details at the prompts; the password prompt hides your input. Use a password of 10–128 characters. Do this before creating a normal account with the same email.

```powershell
$env:BOOTSTRAP_ADMIN_EMAIL = Read-Host 'Administrator email'
$env:BOOTSTRAP_ADMIN_NAME = Read-Host 'Administrator name'
$passwordInput = Read-Host 'Choose administrator password' -AsSecureString
$localCredential = [System.Management.Automation.PSCredential]::new($env:BOOTSTRAP_ADMIN_EMAIL, $passwordInput)
$env:BOOTSTRAP_ADMIN_PASSWORD = $localCredential.GetNetworkCredential().Password
try {
    .\run.bat
} finally {
    Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL, Env:BOOTSTRAP_ADMIN_NAME, Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    $localCredential = $null
    $passwordInput.Dispose()
}
```

Keep the server running and use **Admin login** with the details you entered. After stopping it, later launches can use `run.bat` normally. Bootstrap creates the first administrator only; it does not reset an existing administrator's password.

To retain records from an existing **V5/PocketSync** installation, stop both servers, back up the complete private `data` folder, and copy it beside this project's `run.bat`. Keep that folder on your computer and out of browser uploads. An older **V4** database uses a different schema: follow `DATABASE_MIGRATION.md` instead of simply copying it into this project.

## Upload an update using the GitHub website

See **BROWSER_UPDATE.md** for the exact V4 cleanup list and upload steps. Upload the contents of this folder, including `.mvn` and `.gitignore`, so `pom.xml` appears directly at the repository's project root. Browser uploads do not apply `.gitignore`; upload this clean source folder rather than your running copy's private `data` folder or build output.

## What works

| Area | Functionality |
| --- | --- |
| Dashboard | Monthly totals, cumulative spending, annual history, category breakdowns, subscription overview and budget progress ring. Statistic cards and category labels open related data. |
| Profile | Top avatar and sidebar account open My profile. Edit your display name, manage sharing, change your password and inspect recent activity. |
| Budget history | Tap **any month in the annual graph** to open its saved overall and category limits. Change the year, use month navigation or select a month in the history table. Historical budgets remain independent. |
| Subscriptions | Create recurring expenses or income, choose a category and billing frequency, edit amounts/plans, pause/resume, remove schedules, export the filtered list and record due billings. |
| Billing calendar | Select a month or day to inspect planned billing entries; recorded recurring transactions appear in the monthly ledger. |
| Ledger | Add, edit, inspect and delete transactions; turn an existing expense/income into a recurring schedule; compose search, category, payment, date and type filters; export the filtered rows. |
| Imports | Smart bank/UPI CSV categorization or a preview-and-review inbox flow. Duplicate references are checked; matching links an existing ledger entry instead of adding it twice. |
| Reports | Download monthly CSV, Excel and PDF reports with explicit recorded tax, income, expenses, refunds and transfers. |
| Settings | Per-account currency formatting and accent preferences, links to account/privacy controls, ledger export and statement imports. |
| Administration | Own tracker plus consent-based, read-only views of shared user trackers. Account access and sharing changes are recorded. |

### Recurring billing rules

- Frequencies: **weekly, monthly, quarterly and yearly**.
- Categories include **Subscriptions, Streaming, Music, Software, Cloud Storage, Fitness and Memberships**, alongside the existing expense categories. They work in transaction forms, filters, budgets, imports and reports.
- A new schedule uses **manual recording by default**. Its **Record** action posts the oldest due billing once and advances the next billing date.
- Enable **Automatically record each due billing** to post due entries while the Java server runs. Processing occurs every minute and when your own workspace is refreshed. Automatic recording catches up missed due dates after restarting the server, in batches of at most 366 entries per account per pass.
- Recording only writes a ledger entry. **PocketSync does not charge a bank account or pay a subscription provider.**
- The original billing day remains the anchor: January 31 → February 28/29 → March 31. Yearly leap-day billing similarly returns to February 29 in a leap year.
- Pausing stops future entries. On resume, past paused periods are skipped; a billing due today is still available.
- The optional end date is inclusive. Entries beyond it are not recorded.
- Changing an amount or plan affects future entries. Recorded entries retain their original amounts. First billing/frequency are fixed in the edit dialog; create a new schedule to change them.
- Removing a schedule preserves ledger history. A durable occurrence record and database uniqueness prevent duplicate billings, even if you later delete a generated ledger transaction.
- Monthly recurring cost is a normalized estimate (weekly × 52/12, quarterly ÷ 3, yearly ÷ 12). Spending totals and reports use actual ledger amounts and never count the schedule itself as another expense.

## Data and account security

- Data remains in **data/expense-v5.mv.db**; this path is retained for compatibility with the existing V5 project. Flyway V2 adds recurring tables without replacing existing records.
- Salted PBKDF2 hashes protect passwords. Short-lived JWT access tokens stay in browser memory; refresh tokens use a rotating HttpOnly cookie. Password changes and logout revoke previous sessions.
- Every financial operation checks the signed-in owner. Sharing permits read-only administrator views and can be revoked from Profile.
- Local databases, account-access files, signing keys, secret settings and build output are excluded from this source ZIP and ignored by Git. The H2 runtime file is not encrypted. Keep the local `data` folder private.
- Currency selection changes **formatting only**. The base currency remains INR; no FX conversion occurs. Exports and reports retain INR amounts.
- The example CSV files in `samples/` contain fictional records for testing the statement import.

Back up the complete `data` folder while the server is stopped. To use your own existing V5 records, back up your old folder and copy its `data` folder into this project before first launch. Keep the same signing key with its database. Do not run two servers against the same H2 file.

## Structure

```text
PocketSync/
├── pom.xml, package.json, mvnw, mvnw.cmd
├── run.bat, run.sh
├── data/                         Created at runtime; private, ignored, not supplied
├── samples/                      Statement CSV examples
├── src/main/java/com/saksham/expense/
│   ├── AuthController.java, AuthService.java, SecurityConfig.java
│   ├── WorkspaceController.java, WorkspaceService.java
│   ├── TransactionService.java, Repositories.java
│   ├── RecurringTransaction.java, RecurringOccurrence.java
│   ├── RecurringController.java, RecurringService.java, RecurringScheduler.java
│   ├── StatementController.java, StatementService.java, StatementParser.java
│   └── ReportController.java, ReportService.java, AdminController.java, AdminService.java
├── src/main/resources/
│   ├── application.yml, application-postgres.yml, application-mysql.yml
│   ├── db/migration/V1__initial_schema.sql
│   ├── db/migration/V2__recurring_transactions.sql
│   └── static/index.html, app.js, logic.js, presentation.js, pocket.js,
│              styles.css, pocketsync.css
├── src/test/java/com/saksham/expense/
└── tests/                        Dependency-free frontend rule/controller tests
```

## Development and verification

```sh
./mvnw test
node --test tests/*.test.js
node --check src/main/resources/static/app.js
./mvnw package
```

Node 22+ is only needed for frontend tests; it is not required to run PocketSync. The frontend needs no npm packages and no remote CDN. See `VERIFICATION.md`, `IMPLEMENTATION.md` and `DATABASE_MIGRATION.md` for validation and architecture details.

The database profiles and the original one-time V4 migration remain available. `.env.example` is a configuration reference; launch scripts do not automatically load it.
