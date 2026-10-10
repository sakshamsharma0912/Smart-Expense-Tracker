# PocketSync implementation

The upgrade retains the Java/Spring Boot/H2 application. It adds complete profile, subscription and billing-calendar views, connects the annual graph to historical budgets, and applies a consistent midnight navy/sapphire design to the retained ledger, reports, import, inbox, admin and authentication views.

## Frontend

`app.js` renders the signed-in workspace and handles delegated click, submit, change and input events. Views include Dashboard, Transactions, Subscriptions, Billing calendar, Budgets, Reports, Bank imports, Review inbox, Profile, Settings and Admin dashboard. Native buttons, selects, dialogs and calendar-day controls support keyboard access. URL hash state records the view and month; browser back navigation restores them. Ctrl/Cmd+K opens transaction search.

`pocket.js` contains pure history, billing projection, recurrence status, subscription filtering and monthly-equivalent calculations. `logic.js` retains exact minor-unit ledger arithmetic, original CSV parsing and summaries. `presentation.js` handles formatting, composed filters, budget-ring thresholds and safe CSV generation. `pocketsync.css` layers the new visual design and responsive layouts over the retained forms/tables.

The annual graph is composed of 12 native month buttons. Each reads its own calendar month’s expense sum and saved overall budget from workspace data. Selecting one changes the reporting month and opens Budgets. Category budgets are shown separately and are never added to the overall limit automatically.

The top avatar always opens the signed-in user’s profile. When an administrator is inspecting a shared tracker, opening Profile or Settings returns to their own workspace first.

## Backend and recurrence integrity

Flyway `V2__recurring_transactions.sql` introduces two tables:

- `recurring_transactions`: user-owned schedule, plan, amount, category, entry type, method, billing frequency, original anchor, next date, optional end date, active/archive flags, automatic-recording consent, notes and included tax.
- `recurring_occurrences`: durable occurrence date and original ledger identifier, unique by schedule/date. Removing a ledger transaction does not remove this record.

All schedule writes use the existing authenticated-owner lock. The same lock serializes scheduled automatic processing, manual Record requests, profile/password writes and normal ledger edits. Each recorded billing snapshots the current schedule fields, adds an occurrence and advances the next date in one transaction. A stale manual request with an old expected due date is rejected rather than silently recording another period.

`RecurringScheduler` processes automatic schedules every minute while the server runs. `GET /api/state` also catches up the authenticated user’s automatic entries before returning the workspace. Shared admin reads return existing records without initiating a write on someone else’s behalf. At most 366 entries are processed per account per pass; further due entries are handled in the next pass.

Month-based frequencies compute the next year/month and clamp the original anchor day to its last valid day. Weekly recurrence advances seven calendar days. Java and frontend date logic use India-local billing dates.

Schedule deletion archives the schedule and leaves ledger history intact. Pausing preserves the next date; resuming skips dates strictly before today. Price/plan updates do not rewrite historical transactions. First date/frequency changes are rejected once an occurrence exists.

## API additions

| Method | Endpoint | Purpose |
| --- | --- | --- |
| POST | `/api/recurring` | Create schedule |
| PUT | `/api/recurring/{id}` | Update schedule details |
| PUT | `/api/recurring/{id}/status` | Pause/resume |
| POST | `/api/recurring/{id}/record` | Record the expected due date once |
| DELETE | `/api/recurring/{id}` | Archive schedule and preserve ledger |
| POST | `/api/recurring/sync` | Catch up owned automatic schedules |
| DELETE | `/api/budgets/{id}` | Remove an owned budget limit |

The existing `/api/profile` and `/api/password` endpoints now power the dedicated profile view. All additions use the existing JWT authentication, input validation, owner checks, transaction rollback and audit mechanisms.

A subscription schedule is a bookkeeping feature. It stores no provider credentials or payment authorization and makes no bank charge.

## Session refresh correction

A refresh token references its user through a lazy JPA association. That association can cause the owner-lock query to return a Hibernate proxy. Reading package fields from the proxy used constructor defaults (including an unrelated UUID) rather than the persistent owner values. The refresh flow now resolves the managed user before issuing claims, checks the resolved active flag, and uses the same resolved owner in state serialization and owner locks. The regression suite verifies that a refreshed administrator token keeps its original owner/role and can authorize an admin request and logout.
