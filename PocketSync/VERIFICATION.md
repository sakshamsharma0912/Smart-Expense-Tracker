# PocketSync verification

## Automated suites

- **29 Java tests passed**: 11 retained API integration tests, 2 retained V4 migration tests, and 16 PocketSync tests.
- **24 frontend tests passed**: 6 retained presentation tests, 8 recurring/history rule tests and 10 actual application-controller tests using a small DOM harness.
- All JavaScript modules passed syntax checks.
- Maven package completed successfully with the pinned Spring Boot/Maven dependencies and produced the executable `target/pocketsync.jar`.
- Flyway initialized V1/V2 and Hibernate schema validation passed on H2.

## What the new tests verify

- Graph selection opens the selected historical month without overwriting another month’s budget.
- Top-profile navigation, profile save, password form, calendar/day details, recurring dialogs, filters, statistic shortcuts, keyboard search and browser-history handlers.
- Every action/page target exposed by the rendered normal workspace resolves to a handler/view, including empty datasets.
- Subscription form persistence; manual due recording; expected-date duplicate protection; automatic catch-up; no early future billing; inclusive end dates; pause/resume and retained ledger history on removal.
- Monthly/quarterly/yearly anchor behavior across short months and leap years.
- Owner checks for recurring update/delete/status/record and budget deletion.
- Invalid money precision, categories, dates, flags, tax and entry types are rejected atomically.
- Recurring income remains separate from expenses; normalized subscription estimates do not double-count ledger records.
- Background processing works without browser activity.
- Refreshed tokens retain the actual owner ID and administrator role and can authenticate another request. Live checks exposed a lazy-entity proxy issue in the retained refresh flow; the fix is covered by this regression test.
- Subscription merchant categories stay consistent between frontend suggestions and the bank parser.

The retained suites continue to verify login/registration role protection, JWT tampering, refresh-cookie rotation/origin protection, logout/password revocation, sharing consent, imports and duplicates, PDF/Excel totals, recorded tax and V4 migration/rollback behavior.

## Live HTTP checks

**72 live HTTP checks passed** against a real Spring Boot process using a copy of the populated database. These verified all six logins, three months of separate budgets, cross-account denials, three concurrent requests recording a due billing exactly once, recurring creation/update/pause/resume/removal, automatic catch-up, every new category, profile changes, sharing revocation, smart statement import/deduplication, three months of PDF/Excel downloads, refresh rotation and logout with the refreshed token. The process was stopped after the checks. Delivered sample records were not changed.

## Public source package

This GitHub-ready ZIP contains no account database, account-access file or signing key. The populated fictional database used for the development HTTP checks is kept separately. A fresh launch initializes empty H2 tables; users can register and enter/import their own records. Administrator setup is documented in README.md.

The application source is unchanged from the verified PocketSync build. This packaging update changes documentation and ignore rules and removes private runtime files. Archive validation checks the source against that build and verifies the private files are absent.

## Verification limits

A real browser automation surface was unavailable, so **real-browser visual/responsive QA was not performed**. Controller event tests and source checks verify interactions, but do not replace visual inspection in Firefox/Chrome. PostgreSQL/MySQL profiles retain their configuration and portable migration SQL; this run executed H2 only.

Reproduce the suites:

```sh
./mvnw test
node --test tests/*.test.js
./mvnw package
```

No npm dependencies are required. The executable JAR and build caches are excluded from the source ZIP; `run.bat`/`run.sh` rebuild it using the included Maven wrapper.
