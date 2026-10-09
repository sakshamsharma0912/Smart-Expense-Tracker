# Smart Expense Tracker — Version 4

Java website by Saksham Sharma. Start with **START_HERE.md**.

This version uses an embedded H2 SQL database for real accounts, password hashes, expenses, imported entries, budgets and activity. The front page offers **User login** and **Admin login**. Every change is saved. Password recovery is deliberately absent.

## Run the website

1. Extract the complete ZIP. Keep its folders together.
2. Install a full **JDK 17 or newer** if needed.
3. Windows: double-click **run.bat**. Mac/Linux: run **sh run.sh**.
4. The website opens at **http://127.0.0.1:8080**. Keep the Java window open.

The database driver and generated browser assets are included; the database is created locally on first run. Normal use needs no npm, Maven, Python, internet connection or separate database server.

**index.html** is a double-clickable launcher with user/admin links. The Java server must be running for accounts and saved records. **dist/index.html** is the actual website shell served by Java; open it through the website URL.

## Preloaded accounts

No account database or fixed login passwords are included in this public package. On first run, Java creates one admin and four fictional users with **66 transactions per user across the current and previous two months**, **27 budgets** and **two imported entries awaiting review**. Each account receives a unique cryptographically random password, printed only in the local Java window as `INITIAL_LOGIN email password`. Save these privately before closing the window. Passwords are not printed on later starts; restarting never resets records or creates duplicate accounts.

## Working features

| Feature | Behaviour |
| --- | --- |
| User authentication | Email/password login, registration, sign-out, password change using the current password |
| Admin authentication | Separate admin portal; user credentials cannot gain admin access |
| Expense tracker | Add, edit, delete, search and filter cash, UPI, card and bank entries |
| Budgets and reports | Monthly and category budgets, charts, income/refund separation, CSV export |
| Statement imports | CSV mapping and preview, duplicate/conflict detection, categorise/match/ignore/restore |
| Admin dashboard | Account directory, shared totals, consent-based read-only tracker views and access logs |
| Persistence | SQL tables, account foreign keys, decimal amounts and transactional writes |
| Responsive UI | Desktop, tablet and mobile layouts, accessible drawer, text hover and reduced-motion support |

The app records digital payments manually or from a CSV. It does not fetch live bank data. An optional authenticated local adapter can import authorised records; see **UPI_INTEGRATION.md**.

## Data and passwords

The database is **data/expense-tracker.mv.db**. Passwords are salted PBKDF2-HMAC-SHA256 hashes with 210,000 iterations; plaintext passwords are never saved in the accounts table or returned by the API. Changing a password revokes other sessions. Sessions use HttpOnly SameSite cookies and expire after eight hours or a server restart.

Use the locally generated first-install passwords to sign in, then change them in Settings. The original version’s passwords do not work with this fresh public copy. Stop Java before copying the database file for a backup. Do not delete or replace your working database when updating the code.

For accounts created in the previous release, use a separate empty data folder containing your existing `users/*.properties` files. On first start, Java imports those files into SQL and preserves their passwords and tracker records. It keeps the old files unchanged and does not overwrite an existing SQL database. Details: **DATABASE.md**.

## Mobile browser

Run **run-android-wifi.bat** on Windows to bind the app to your private network. Open the phone URL printed in the Java window on a device connected to the same Wi-Fi. The laptop must stay running. This package runs over local HTTP; it is not a publicly hosted HTTPS website.

## Source structure

- `ExpenseServer.java`: compile/start launcher.
- `src/tracker/`: separate application, authentication, session, repository, migration, seed, transaction, import and controller classes.
- `database/schema.sql`: table definitions.
- `lib/`: bundled JDBC driver and its license.
- `dist/`: served HTML/CSS/JavaScript; `app.js` and `logic.js` are the editable modules.
- `tools/build_html.py`: regenerates `bundle.js` and the HTML launcher after frontend edits.
- `templates/`: bank statement CSV format.
- `tests/`: API, frontend and desktop/mobile browser checks.

See **ARCHITECTURE.md**, **PROJECT_GUIDE.md** and **TEST_RESULTS.md** for the class responsibilities, project explanation and verification evidence.

## Developer commands

```sh
java -Dfile.encoding=UTF-8 --add-modules jdk.httpserver ExpenseServer.java --open
java --add-modules jdk.httpserver ExpenseServer.java --port=8090 --data-dir=my-records
python3 tools/build_html.py
python3 tests/api_test.py
node tests/project.test.mjs
```

Use `--no-seed` with a new empty data folder to create your own first admin via the one-time setup link printed by Java. Use `--initialize-only` to create/open the database and exit. For browser tests, install Playwright and its Chromium browser, then run `node tests/browser.test.mjs`; `CHROME_EXECUTABLE` can select an existing Chromium binary. None of these testing dependencies is needed to use the website.

## Upload to GitHub

Extract this ZIP and upload the contents of this folder, including `.gitignore`. The package has already excluded databases, account files, fixed login details, browser captures, logs and compiled outputs. Upload before running it locally.

`.gitignore` excludes future local databases, credentials, logs and test evidence when using Git. GitHub's browser upload does not apply `.gitignore`: if you run the app first, manually leave out `data/`, `build/`, `tests/browser-evidence/`, private settings and any logs when uploading. Keep personal CSV statements and backups outside the repository.

Public source code includes authentication and password hashing logic; secret values are generated locally or supplied through environment variables. Synthetic test passwords and fixture emails are only for disposable tests. This package is for local use; uploading it does not deploy the Java server.
