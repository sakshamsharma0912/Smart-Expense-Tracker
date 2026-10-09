# Project explanation

**Smart Expense Tracker** is a Java web application for individual financial records and an admin account directory. Saksham Sharma's project uses HTML/CSS/JavaScript for the browser, Java classes for HTTP and business rules, and H2 SQL tables for persistent storage.

The home page offers normal-user and administrator login. A normal user registers or signs in, adds expenses, sets budgets, reviews imported transactions and sees reports. An admin signs in through a separate portal and can view trackers with user permission.

## Suggested walkthrough

1. Start run.bat and open the front page. Show the two login choices.
2. Sign in as Aarav using the password generated in the Java window on first run. Switch between the current and previous two months to show the saved history.
3. Add a cash expense and set a category budget. Reload: the data is still present.
4. Open Review inbox, choose a category for an imported payment, and save it. Pending entries do not count as spending before approval.
5. Open Bank imports, select a statement CSV, inspect its mapping/preview and commit. Importing the same reference again skips duplicates.
6. Sign in as admin in a separate browser profile/incognito window. View the account directory and a shared tracker; editing controls are absent and the visit is logged.
7. Turn sharing off from the user's Settings and show that admin access is revoked.
8. Stop and restart Java, sign in again and show that records and budgets persist in the SQL database.

## Points for a viva

- Java class separation: authentication, sessions, SQL repository, transactions, imports and controllers have distinct responsibilities.
- Password storage: a random salt and PBKDF2 hash are saved; plaintext credentials are not in the accounts table.
- Access control: the stored database role determines admin permission; client input cannot create an admin during registration.
- Decimal correctness: Java uses BigDecimal, SQL uses DECIMAL, and frontend totals use integer paise.
- Atomic writes: validation happens before commit; SQL failures roll back the whole snapshot.
- Account isolation: every tracker row belongs to an account and each lookup is scoped to the signed-in workspace.
- Imports: unique account/reference keys, direction validation and matching prevent counting one payment twice.
- Responsive interaction: text hover, touch navigation, keyboard focus, reduced-motion preference and contained dialogs.

The installed user histories are fictional but persist like any other account data. Digital payments are manually recorded or imported; no bank connection or password-recovery service is claimed.
