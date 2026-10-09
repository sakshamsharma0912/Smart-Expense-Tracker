# Verification

## Public package, 9 October 2026

Passwords are generated locally at first initialization, and tests obtain seed passwords from their disposable server process rather than fixed credentials. Database files, original login documentation and historical browser captures are omitted from the public package.

Re-run on the cleaned source: **106 API integration checks passed** and **43 frontend checks passed**. The browser suite was updated but could not run here because its Chromium executable is unavailable; the historical browser results below have not been re-verified for this copy.

The original V4 suite and Chromium evidence below describe the earlier package. Browser tests have been updated for runtime credentials and the generic admin label; their old screenshot files are excluded.

## Verification — Smart Expense Tracker v4

Verified on 8 October 2026 using JDK 17 and headless Chromium 153.0.8010.0. All automated tests use disposable fictional accounts and records; they do not modify the supplied populated database.

| Suite | Result | Scope |
| --- | --- | --- |
| Java API integration | **106 checks passed** | Real password login, portal role enforcement, registration, account isolation, admin consent, SQL persistence, password change/session revocation, exact amounts, CSV review, request boundaries, seeding and previous-file migration |
| Frontend calculations and markup | **43 checks passed** | Exact paise totals, dates, CSV parsing/deduplication, portal forms, pages, dialogs, escaped text, read-only controls, unique IDs and label/button correctness |
| Actual Chromium browser | **158 checks passed** | Login/registration, database writes, file input/export, password change, earlier CSV migration, six layouts, touch drawer, dialogs, text hover, reduced motion and HTML launcher links |

## Viewports

| Viewport | Coverage |
| --- | --- |
| 1440 × 1000 | Desktop login choices/forms, all tracker pages, admin directory, expense CRUD, imports/export, sharing, password change and text hover |
| 1024 × 900 | Laptop login/registration, all tracker pages and expense entry |
| 768 × 1024 | Tablet login/registration, all tracker pages and expense entry |
| 390 × 844 | Touch emulation, login/registration, all pages, drawer, expense entry, payment review, admin directory and read-only shared view |
| 360 × 800 | Small phone login/registration, all pages, chart-label size, drawer and expense entry |
| 320 × 740 | Compact phone login/registration, all pages, chart-label size, drawer, expense entry and standalone launcher |

All measured pages have no horizontal page overflow. Dialog bounds stay inside the viewport. Mobile chart text remains at least 10 CSS pixels after scaling. Text hover changes colour/underline without shifting layout; reduced-motion preference disables transitions. Long dialogs scroll internally, including their action buttons.

## Persistence and installed data

The API suite validates a fresh installation with one admin and four normal users. Each user has 66 transactions over three months, 27 budgets and two pending imports. It verifies every locally generated seeded password, consent-based admin views and absence of credential hashes in API state.

After adding a transaction and restarting the server, the same account ID and new transaction remain. Initialization does not reset passwords, records or duplicate accounts. A password changed with the current password remains changed after restart, and other sessions are invalidated.

Previous-version account files migrate into SQL while preserving their password hashes, account IDs and ledger. Migration leaves the source files unchanged and runs once. The old CSV import flow also saves its longer legacy record IDs successfully.

The shipped **data/expense-tracker.mv.db** was separately inspected through SQL: **5 accounts**, **264 ledger entries**, **108 budgets**, and **8 pending imports**. Four user histories cover August–October 2026. The database driver and schema are included in the ZIP.

## Browser workflows

- Admin password sign-in and four-account directory; private user registration and role-specific sign-in.
- Cash add/reload/search/export, monthly budget, manual edit/delete.
- Native statement file input, column mapping, preview, commit, expense/income approval and categorisation on mobile.
- Sharing opt-in, logged read-only viewing, revocation, logout/re-login.
- Authenticated password change and sign-in with the updated password.
- Native old expenses.csv selection and SQL-backed migration.
- Launcher admin/user links to the real server across origins; the fixture substitutes only the temporary server port.

No uncaught JavaScript or unexpected resource errors were observed. Anonymous state probes returning 401 and revoked shared views returning 403 are expected responses.

## Evidence and visual review

Inspected desktop front page/overview and mobile front page/payment dialog/admin directory screenshots. Evidence is under `tests/browser-evidence/`: `results.json`, `desktop-sign-in.png`, `desktop-overview.png`, `desktop-shared-tracker.png`, `mobile-sign-in.png`, `mobile-overview.png`, `mobile-payment-review.png`, and `mobile-owner-dashboard.png`.

## Verification limits

Mobile coverage uses Chromium viewport/touch emulation, not physical Android/iOS devices. Firefox, Safari and native Windows/macOS launcher execution are not covered. Java/launcher execution was tested on Linux. The standalone launcher was exercised over HTTP; direct file:// navigation was not exercised. It has embedded CSS and ordinary absolute HTTP links, with no scripts, modules or external assets.

The website runs locally with Java. It is not publicly hosted. Live bank-provider fetching and password recovery are absent by design.

## Repeat checks

```sh
python3 tests/api_test.py
node tests/project.test.mjs
# Browser tools are optional development dependencies:
npm install --no-save playwright
npx playwright install chromium
node tests/browser.test.mjs
```

Use `CHROME_EXECUTABLE` to select an existing Chromium binary. The tests create and remove temporary databases outside the app's own data folder.
