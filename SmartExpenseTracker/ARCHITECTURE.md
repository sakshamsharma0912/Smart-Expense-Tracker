# Java class organisation

The project uses Java 17, the JDK HTTP server and the bundled H2 JDBC driver. No framework or Maven is required.

| Class | Responsibility |
| --- | --- |
| ExpenseServer | Compiles the Java sources and loads classes plus the JDBC driver |
| ExpenseApplication | Starts HTTP, wires services, validates hosts/origins and serves browser assets |
| ApiController | Routes authenticated account operations |
| AuthenticationService | Role-specific login, user registration, first-admin setup and authenticated password change |
| PasswordService | PBKDF2 hashes, random salts/tokens and constant-time secret comparison |
| SessionService | Expiring server-side sessions, cookie rotation, logout and password-change revocation |
| AccountRepository | SQL schema loading, parameterised reads/writes, transactional commits and folder locking |
| LegacyAccountMigration | One-time migration from previous account files |
| SeedDataService | Initializes the admin and four persistent fictional users only for an empty installation |
| Account | Workspace model; deep copies isolate uncommitted changes |
| WorkspaceResponse | Returns permitted state without salts or password hashes |
| AdminController | User directory and consent-based read-only tracker access with audit logging |
| TransactionService | Validated ledger CRUD, monthly/category budgets and import review |
| StatementImportService | CSV mapping, atomic import validation, deduplication and earlier CSV migration |
| CsvParser / ImportResult | CSV parsing and validated import result |
| AdapterController | Optional opt-in HMAC-authenticated loopback import endpoint |
| HttpSupport / Json | Body limits, form parsing, headers and JSON output |
| Validation / Records | Date, decimal and category rules; row IDs and audit events |

## Request and persistence flow

A browser signs in through a selected portal. The server checks the password hash and the account's stored role. It issues an eight-hour session cookie; selecting Admin login cannot promote a USER account. Registration always creates USER accounts.

For a mutation, ApiController finds the authenticated account and makes a deep copy. The relevant service validates and changes that copy. AccountRepository writes the account and its tracker rows inside one SQL transaction. The repository replaces the in-memory account only after commit. The browser receives the committed state.

Admin financial reads require the target user's sharing permission. The response distinguishes the viewer from the tracker owner and marks the view read-only. Admin reads are logged; target mutation routes are blocked. Revoking sharing takes effect immediately.

## Frontend

`dist/app.js` contains rendering, forms, navigation, dialogs and API calls. `dist/logic.js` contains exact-money calculations, date helpers and CSV mapping. `dist/styles.css` provides the responsive layout and text hover. `tools/build_html.py` composes those modules into the served classic `bundle.js` and copies the standalone launcher template to root `index.html`.

There is one real account workflow. The HTML launcher links to the Java server; it does not hold a second financial database or collect credentials offline.
