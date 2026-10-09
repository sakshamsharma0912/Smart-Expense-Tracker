/** Real browser checks against disposable Java accounts and the standalone HTML.
 * npm install --no-save playwright
 * npx playwright install chromium
 * node tests/browser.test.mjs
 * Optional: CHROME_EXECUTABLE=/path/to/chrome node tests/browser.test.mjs
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import { today } from "../dist/logic.js";

const require = createRequire(import.meta.url);
let playwright;
try {
  playwright = require("playwright");
} catch {
  playwright = require(
    require.resolve("playwright", {
      paths: [process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES].filter(Boolean),
    }),
  );
}
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const OUT = join(ROOT, "tests", "browser-evidence");
await mkdir(OUT, { recursive: true });
const temp = await mkdtemp(join(tmpdir(), "expense-browser-"));
const checks = [],
  errors = [];
function check(name, condition = true) {
  assert(condition, name);
  checks.push(name);
  console.log("PASS " + name);
}
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}
async function waitFor(fn, timeout = 30000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await fn()) return;
    await pause(100);
  }
  throw Error("Timed out waiting for application state");
}
async function stop(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    pause(8000),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}
function track(page) {
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (
      m.type() === "error" &&
      !/server responded with a status of (401|403)/.test(m.text())
    )
      errors.push(m.text());
  });
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (
      r.status() >= 400 &&
      !(r.status() === 401 && path === "/api/state") &&
      !(r.status() === 403 && /^\/api\/admin\/users\/[^/]+\/state$/.test(path))
    )
      errors.push(r.status() + " " + path);
  });
}
async function visible(page, selector) {
  await page.locator(selector).waitFor({ state: "visible" });
}
async function cleanLayout(page, name) {
  const size = await page.evaluate(() => ({
    width: document.documentElement.clientWidth,
    scroll: document.documentElement.scrollWidth,
  }));
  if (size.scroll > size.width + 1)
    console.log(
      "OVERFLOW",
      name,
      size,
      await page.evaluate(() =>
        [...document.querySelectorAll("body *")]
          .map((el) => ({
            tag: el.tagName,
            cls: typeof el.className === "string" ? el.className : "svg",
            right: el.getBoundingClientRect().right,
            width: el.getBoundingClientRect().width,
            overflow: getComputedStyle(el).overflow,
          }))
          .filter((el) => el.right > document.documentElement.clientWidth + 1)
          .slice(0, 15),
      ),
    );
  check(
    name + " has no horizontal page overflow",
    size.scroll <= size.width + 1,
  );
}
async function nav(page, name) {
  if ((page.viewportSize()?.width || 1440) <= 700) {
    await page
      .getByRole("button", { name: "Open navigation", exact: true })
      .click();
    await visible(page, ".sidebar.open");
  }
  const links = {
    overview: "overview",
    transactions: "transactions",
    inbox: "inbox",
    budgets: "budgets",
    reports: "reports",
    imports: "imports",
    settings: "settings",
  };
  await page.locator('.sidebar [data-page="' + links[name] + '"]').click();
  await visible(page, ".page-heading");
}
async function state(page) {
  const response = await page.request.get(base + "/api/state");
  assert.equal(response.status(), 200);
  return response.json();
}
async function enterAccount(page, admin = false) {
  await page.goto(base);
  await page
    .getByRole("button", {
      name: admin ? "Admin login" : "User login",
      exact: false,
    })
    .click();
  await page
    .getByLabel("Email address", { exact: true })
    .fill(admin ? "admin@tracker.local" : "aarav@tracker.local");
  await page
    .getByLabel("Password", { exact: true })
    .fill(seedPasswords[admin ? "admin@tracker.local" : "aarav@tracker.local"]);
  await page
    .getByRole("button", {
      name: admin ? "Sign in as admin" : "Sign in as user",
      exact: true,
    })
    .click();
  await visible(page, admin ? ".admin-intro" : ".spend-hero");
}

const seedPasswords = {};
let browser,
  java,
  staticServer,
  log = "";
const port = await freePort(),
  staticPort = await freePort();
const base = "http://127.0.0.1:" + port,
  staticBase = "http://127.0.0.1:" + staticPort;
try {
  java = spawn(
    "java",
    [
      "-Dfile.encoding=UTF-8",
      "--add-modules",
      "jdk.httpserver",
      "ExpenseServer.java",
      "--port=" + port,
      "--data-dir=" + join(temp, "data"),
    ],
    { cwd: ROOT, stdio: ["ignore", "pipe", "pipe"] },
  );
  java.stdout.on("data", (data) => {
    log += data.toString();
  });
  java.stderr.on("data", (data) => {
    log += data.toString();
  });
  await waitFor(async () => {
    if (java.exitCode !== null) throw Error(log);
    return /SQL database are running/.test(log);
  }, 45000);
  for (const match of log.matchAll(/INITIAL_LOGIN ([^\s]+) ([A-Za-z0-9_-]+)/g)) {
    seedPasswords[match[1]] = match[2];
  }
  assert.equal(Object.keys(seedPasswords).length, 5);
  // Use the actual standalone bytes with only the Java link's test port replaced.
  await writeFile(
    join(temp, "index.html"),
    (await readFile(join(ROOT, "index.html"), "utf8")).replaceAll(
      "http://127.0.0.1:8080",
      base,
    ),
  );
  staticServer = spawn(
    "python3",
    ["-m", "http.server", String(staticPort), "--bind", "127.0.0.1"],
    { cwd: temp, stdio: "ignore" },
  );
  await waitFor(async () => {
    try {
      return (await fetch(staticBase)).ok;
    } catch {
      return false;
    }
  });
  browser = await playwright.chromium.launch({
    headless: true,
    ...(process.env.CHROME_EXECUTABLE
      ? { executablePath: process.env.CHROME_EXECUTABLE }
      : {}),
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  console.log("BROWSER " + browser.version());

  // Persistent admin login, private user registration and database writes.
  const ownerContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    owner = await ownerContext.newPage();
  track(owner);
  await enterAccount(owner, true);
  check("admin password login opens the account directory");
  check(
    "admin directory includes four preloaded users",
    (await owner.locator(".directory-table tbody tr").count()) === 4,
  );
  await cleanLayout(owner, "1440px owner dashboard");
  const userContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      acceptDownloads: true,
    }),
    user = await userContext.newPage();
  track(user);
  await user.goto(base);
  await user.getByRole("button", { name: "User login", exact: false }).click();
  await user
    .getByRole("button", { name: "Create an account", exact: true })
    .click();
  await user.getByLabel("Your name", { exact: true }).fill("Browser Test User");
  await user
    .getByLabel("Email address", { exact: true })
    .fill("user@browser.test");
  await user
    .getByLabel("Password", { exact: true })
    .fill("Disposable-browser-Password-234");
  await user.getByLabel("I understand the account privacy notice.").check();
  await user
    .getByRole("button", { name: "Create my tracker", exact: true })
    .click();
  await visible(user, ".spend-hero");
  check(
    "user registration opens a private personal tracker",
    !(await state(user)).profile.share,
  );
  await user.getByRole("button", { name: "Add expense", exact: true }).click();
  await user
    .getByLabel("Description", { exact: true })
    .fill("Browser cash lunch");
  await user.getByLabel("Amount (₹)", { exact: true }).fill("120.25");
  await user.getByLabel("Payment method", { exact: true }).selectOption("Cash");
  await user
    .getByRole("button", { name: "Add transaction", exact: true })
    .click();
  await user.locator("dialog").waitFor({ state: "hidden" });
  check(
    "cash entry saved from browser with exact cents",
    (await state(user)).transactions[0].amount === "120.25",
  );
  await user.reload();
  await visible(user, ".spend-hero");
  check(
    "reload retains Java session and saved transaction",
    (await state(user)).transactions.length === 1,
  );
  await nav(user, "transactions");
  await user.getByLabel("Search transactions").fill("no such record");
  check(
    "transaction search displays the empty state",
    await user.getByRole("heading", { name: "A fresh start" }).isVisible(),
  );
  await user.getByLabel("Search transactions").fill("cash lunch");
  check(
    "transaction search finds the saved entry",
    await user.locator(".ledger-table").isVisible(),
  );
  const downloadPromise = user.waitForEvent("download");
  await user.getByRole("button", { name: "Export CSV", exact: true }).click();
  const download = await downloadPromise;
  const csv = await readFile(await download.path(), "utf8");
  check(
    "CSV export contains the saved transaction",
    csv.includes("Browser cash lunch") && csv.includes("120.25"),
  );
  await nav(user, "budgets");
  await user.getByRole("button", { name: "Set budget", exact: true }).click();
  await user.getByLabel("Budget amount (₹)").fill("2500");
  await user.getByRole("button", { name: "Save budget", exact: true }).click();
  await user.locator("dialog").waitFor({ state: "hidden" });
  check(
    "monthly budget saved through the browser",
    (await state(user)).budgets[0].amount === "2500.00",
  );

  // Native file input, mapping, preview, commit and two approval forms.
  await nav(user, "imports");
  const statement =
    "transaction_id,date,description,amount,direction,method,account\nBROWSER-DEBIT," +
    today() +
    ",Campus Cafe,80.50,DEBIT,UPI,Test bank\nBROWSER-CREDIT," +
    today() +
    ",Allowance,1000.00,CREDIT,Bank,Test bank\n";
  await user.getByLabel("Choose bank statement CSV").setInputFiles({
    name: "browser-statement.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(statement),
  });
  await user
    .getByRole("button", { name: "Preview import", exact: true })
    .click();
  await visible(user, ".import-summary");
  check(
    "native CSV selection reaches the two-entry preview",
    await user.getByText("2 new entries", { exact: true }).isVisible(),
  );
  await user
    .getByRole("button", { name: "Import 2 entries", exact: true })
    .click();
  await visible(user, ".review-transaction");
  await user.getByRole("button", { name: "Save & next", exact: true }).click();
  await waitFor(
    async () =>
      (await user.locator(".review-transaction h3").innerText()) ===
      "Allowance",
  );
  await user.getByRole("button", { name: "Save & next", exact: true }).click();
  await user.locator("dialog").waitFor({ state: "hidden" });
  let saved = await state(user);
  check(
    "debit approval records the UPI expense",
    saved.transactions.some(
      (t) => t.description === "Campus Cafe" && t.type === "expense",
    ),
  );
  check(
    "credit approval records income separately",
    saved.transactions.some(
      (t) => t.description === "Allowance" && t.type === "income",
    ),
  );
  await nav(user, "transactions");
  await user.getByLabel("Search transactions").fill("Browser cash lunch");
  await user
    .getByRole("button", { name: "Edit Browser cash lunch", exact: true })
    .click();
  await user.getByLabel("Amount (₹)", { exact: true }).fill("150.75");
  await user.getByRole("button", { name: "Save changes", exact: true }).click();
  await user.locator("dialog").waitFor({ state: "hidden" });
  check(
    "editing a manual payment saves the updated amount",
    (await state(user)).transactions.some(
      (t) => t.description === "Browser cash lunch" && t.amount === "150.75",
    ),
  );
  await user
    .getByRole("button", { name: "Delete Browser cash lunch", exact: true })
    .click();
  await user
    .getByRole("button", { name: "Remove transaction", exact: true })
    .click();
  await user.locator("dialog").waitFor({ state: "hidden" });
  check(
    "delete removes only the selected disposable test payment",
    (await state(user)).transactions.length === 2,
  );

  // Admin consent and read-only controls in a real browser.
  await nav(user, "settings");
  await user.getByLabel(/Allow Workspace Admin to view my tracker/).check();
  await user
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await owner.getByRole("button", { name: "Refresh", exact: true }).click();
  await owner
    .locator(".directory-table tbody tr")
    .filter({ hasText: "Browser Test User" })
    .getByRole("button", { name: "View tracker", exact: true })
    .click();
  await visible(owner, ".view-banner");
  check(
    "shared tracker is visibly read-only",
    await owner.getByText(/This view is read-only and logged/).isVisible(),
  );
  check(
    "shared tracker hides transaction mutation controls",
    (await owner
      .locator(
        '[data-action="add"],[data-action="cash"],[data-action="edit"],[data-action="delete"]',
      )
      .count()) === 0,
  );
  await owner.screenshot({
    path: join(OUT, "desktop-shared-tracker.png"),
    fullPage: true,
  });
  await user.getByLabel(/Allow Workspace Admin to view my tracker/).uncheck();
  await user
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await waitFor(
    async () => await owner.locator(".admin-intro").isVisible(),
    12000,
  );
  check("revoking consent returns the owner to the account directory");
  await user.getByRole("button", { name: "Sign out", exact: true }).click();
  await visible(user, ".auth-box");
  await user.getByRole("button", { name: "User login", exact: false }).click();
  await user
    .getByLabel("Email address", { exact: true })
    .fill("user@browser.test");
  await user
    .getByLabel("Password", { exact: true })
    .fill("Disposable-browser-Password-234");
  await user
    .getByRole("button", { name: "Sign in as user", exact: true })
    .click();
  await visible(user, ".spend-hero");
  check(
    "sign-out and password sign-in reopen the same tracker",
    (await state(user)).transactions.length === 2,
  );

  // A password change is authenticated; recovery is intentionally absent.
  await nav(user, "settings");
  await user
    .getByLabel("Current password", { exact: true })
    .fill("Disposable-browser-Password-234");
  await user
    .getByLabel("New password", { exact: true })
    .fill("Updated-browser-Password-567");
  await user
    .getByLabel("Confirm new password", { exact: true })
    .fill("Updated-browser-Password-567");
  await user
    .getByRole("button", { name: "Change password", exact: true })
    .click();
  await waitFor(async () =>
    (await user.locator("#toasts").innerText()).includes("Password changed"),
  );
  await user.getByRole("button", { name: "Sign out", exact: true }).click();
  await visible(user, ".login-choices");
  await user.getByRole("button", { name: "User login", exact: false }).click();
  await user
    .getByLabel("Email address", { exact: true })
    .fill("user@browser.test");
  await user
    .getByLabel("Password", { exact: true })
    .fill("Updated-browser-Password-567");
  await user
    .getByRole("button", { name: "Sign in as user", exact: true })
    .click();
  await visible(user, ".spend-hero");
  check("password changed through settings works at the next sign-in");
  await nav(user, "imports");
  await user
    .getByRole("button", { name: "Import old tracker data", exact: false })
    .click();
  await user
    .getByLabel("Old expenses.csv", { exact: true })
    .setInputFiles({
      name: "expenses.csv",
      mimeType: "text/csv",
      buffer: Buffer.from(today() + ",Previous lunch,Food,30.25\n"),
    });
  await user
    .getByRole("button", { name: "Import old expenses", exact: true })
    .click();
  await user.locator("dialog").waitFor({ state: "hidden" });
  check(
    "previous tracker CSV saves a longer legacy ID in the database",
    (await state(user)).transactions.some(
      (t) =>
        t.description === "Previous lunch" &&
        t.id.startsWith("legacy-") &&
        t.amount === "30.25",
    ),
  );

  // Layout and touch interaction matrix uses database-backed seeded accounts.
  const sizes = [
    { name: "desktop", width: 1440, height: 1000 },
    { name: "laptop", width: 1024, height: 900 },
    { name: "tablet", width: 768, height: 1024 },
    { name: "mobile", width: 390, height: 844 },
    { name: "small-mobile", width: 360, height: 800 },
    { name: "compact-mobile", width: 320, height: 740 },
  ];
  for (const size of sizes) {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      hasTouch: size.width <= 700,
      isMobile: size.width <= 700,
    });
    const page = await context.newPage();
    track(page);
    await page.goto(base);
    await visible(page, ".login-choices");
    await cleanLayout(page, size.width + "px front page");
    check(
      size.width + "px front page exposes both login choices",
      (await page.locator(".login-choice").count()) === 2,
    );
    check(
      size.width + "px front page has no demo controls",
      !/sample|demo|forgot password/i.test(
        await page.locator("body").innerText(),
      ),
    );
    if (size.name === "desktop")
      await page.screenshot({
        path: join(OUT, "desktop-sign-in.png"),
        fullPage: true,
      });
    if (size.name === "mobile")
      await page.screenshot({
        path: join(OUT, "mobile-sign-in.png"),
        fullPage: true,
      });
    await page
      .getByRole("button", { name: "Admin login", exact: false })
      .click();
    await cleanLayout(page, size.width + "px admin sign-in");
    check(
      size.width + "px admin portal has no registration",
      (await page
        .getByRole("button", { name: "Create an account", exact: true })
        .count()) === 0,
    );
    await page
      .getByRole("button", { name: "Choose another workspace", exact: false })
      .click();
    await page
      .getByRole("button", { name: "User login", exact: false })
      .click();
    await cleanLayout(page, size.width + "px user sign-in");
    await page
      .getByRole("button", { name: "Create an account", exact: true })
      .click();
    await cleanLayout(page, size.width + "px registration");
    await enterAccount(page);
    check(
      size.width + "px user account has persistent three-month history",
      new Set((await state(page)).transactions.map((t) => t.date.slice(0, 7)))
        .size === 3,
    );
    await cleanLayout(page, size.width + "px overview");
    if (["desktop", "mobile"].includes(size.name))
      await page.screenshot({
        path: join(OUT, size.name + "-overview.png"),
        fullPage: true,
      });
    if (size.width <= 700) {
      check(
        size.width + "px chart labels stay readable",
        await page
          .locator(".bar-chart text")
          .evaluateAll((labels) =>
            labels.every(
              (el) =>
                parseFloat(getComputedStyle(el).fontSize) *
                  el.getScreenCTM().a >=
                10,
            ),
          ),
      );
      await page
        .getByRole("button", { name: "Open navigation", exact: true })
        .click();
      check(
        size.width + "px navigation opens with expanded state",
        (await page.locator(".mobile-menu").getAttribute("aria-expanded")) ===
          "true",
      );
      check(
        size.width + "px drawer makes the background inert",
        (await page.locator(".main").getAttribute("inert")) !== null,
      );
      await page
        .getByRole("button", { name: "Close navigation", exact: true })
        .press("Escape");
      check(
        size.width + "px Escape closes the drawer",
        (await page.locator(".sidebar.open").count()) === 0,
      );
    }
    for (const route of [
      "transactions",
      "inbox",
      "budgets",
      "reports",
      "imports",
      "settings",
    ]) {
      await nav(page, route);
      await cleanLayout(page, size.width + "px " + route);
    }
    await nav(page, "overview");
    await page
      .getByRole("button", { name: "Add expense", exact: true })
      .click();
    await cleanLayout(page, size.width + "px transaction dialog");
    check(
      size.width + "px dialog stays inside the viewport",
      await page.locator("dialog").evaluate((el) => {
        const r = el.getBoundingClientRect();
        return (
          r.left >= 0 &&
          r.right <= innerWidth + 1 &&
          r.top >= 0 &&
          r.bottom <= innerHeight + 1
        );
      }),
    );
    await page
      .getByLabel("Description", { exact: true })
      .fill("Responsive cash entry");
    await page.getByLabel("Amount (₹)", { exact: true }).fill("20");
    await page
      .getByLabel("Payment method", { exact: true })
      .selectOption("Cash");
    await page
      .getByRole("button", { name: "Add transaction", exact: true })
      .click();
    await page.locator("dialog").waitFor({ state: "hidden" });
    check(
      size.width + "px expense form works",
      (await state(page)).transactions.some(
        (t) => t.description === "Responsive cash entry",
      ),
    );
    if (size.name === "mobile") {
      await nav(page, "inbox");
      const importId = await page
        .locator('[data-action="review"]')
        .first()
        .getAttribute("data-id");
      await page.locator('[data-action="review"]').first().click();
      await visible(page, ".review-transaction");
      await cleanLayout(page, "390px payment review dialog");
      await page.screenshot({
        path: join(OUT, "mobile-payment-review.png"),
        fullPage: false,
      });
      await page.getByRole("button", { name: "Travel", exact: true }).click();
      await page
        .getByRole("button", { name: "Save & next", exact: true })
        .click();
      await waitFor(async () =>
        (await state(page)).transactions.some((t) => t.inboxId === importId),
      );
      check(
        "390px category selection saves a database-backed imported payment",
        (await state(page)).transactions.some(
          (t) => t.inboxId === importId && t.category === "Travel",
        ),
      );
      await page
        .getByRole("button", { name: "Close dialog", exact: true })
        .click();
      await nav(page, "overview");
    }
    if (size.name === "desktop") {
      const heading = page.locator(".page-heading .text-hover");
      const before = await heading.evaluate((el) => ({
        color: getComputedStyle(el).color,
        width: el.getBoundingClientRect().width,
      }));
      await heading.hover();
      await pause(250);
      const after = await heading.evaluate((el) => ({
        color: getComputedStyle(el).color,
        width: el.getBoundingClientRect().width,
      }));
      check(
        "heading text changes colour on hover",
        after.color !== before.color,
      );
      check(
        "text hover does not shift layout",
        Math.abs(after.width - before.width) < 0.1,
      );
      await page
        .getByRole("button", { name: "Add expense", exact: true })
        .hover();
      check(
        "button text gains a hover underline",
        await page
          .locator('[data-action="add"] .btn-label')
          .evaluate((el) =>
            getComputedStyle(el).textDecorationLine.includes("underline"),
          ),
      );
      await page.emulateMedia({ reducedMotion: "reduce" });
      check(
        "reduced motion disables transitions",
        await heading.evaluate(
          (el) => getComputedStyle(el).transitionDuration === "0s",
        ),
      );
    }
    await context.close();
  }

  const mobileOwnerContext = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const mobileOwner = await mobileOwnerContext.newPage();
  track(mobileOwner);
  await enterAccount(mobileOwner, true);
  await visible(mobileOwner, ".admin-intro");
  await cleanLayout(mobileOwner, "390px owner dashboard");
  await mobileOwner.screenshot({
    path: join(OUT, "mobile-owner-dashboard.png"),
    fullPage: true,
  });
  await mobileOwner
    .getByRole("button", { name: "View tracker", exact: true })
    .first()
    .click();
  await visible(mobileOwner, ".view-banner");
  await cleanLayout(mobileOwner, "390px shared tracker");
  check(
    "390px shared tracker remains read-only",
    (await mobileOwner
      .locator(
        '[data-action="add"],[data-action="edit"],[data-action="delete"]',
      )
      .count()) === 0,
  );
  await mobileOwnerContext.close();

  // Standalone HTML opens the actual server; no local financial state or credentials.
  const standalone = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
    }),
    launcher = await standalone.newPage();
  track(launcher);
  await launcher.goto("http://localhost:" + staticPort + "/index.html");
  await visible(launcher, ".links");
  check(
    "HTML launcher explains how to start the real website",
    (await launcher.locator("body").innerText()).includes("run.bat"),
  );
  check(
    "HTML launcher has no credentials or financial sample",
    (await launcher.locator("input").count()) === 0 &&
      !/sample|demo/i.test(await launcher.locator("body").innerText()),
  );
  await launcher
    .getByRole("link", { name: "Admin login", exact: false })
    .click();
  await visible(launcher, 'form[data-form="auth"]');
  check(
    "HTML admin link opens the real admin login across origins",
    new URL(launcher.url()).port === String(port) &&
      (await launcher
        .getByRole("button", { name: "Sign in as admin", exact: true })
        .isVisible()),
  );
  await launcher.goto("http://localhost:" + staticPort + "/index.html");
  await launcher
    .getByRole("link", { name: "User login", exact: false })
    .click();
  await visible(launcher, 'form[data-form="auth"]');
  check(
    "HTML user link opens the real normal-user login",
    await launcher
      .getByRole("button", { name: "Sign in as user", exact: true })
      .isVisible(),
  );
  const entryHeading = launcher.locator(".auth-box h2");
  const entryColor = await entryHeading.evaluate(
    (el) => getComputedStyle(el).color,
  );
  await entryHeading.hover();
  await pause(250);
  check(
    "sign-in heading responds to text hover",
    (await entryHeading.evaluate((el) => getComputedStyle(el).color)) !==
      entryColor,
  );
  const html = await readFile(join(ROOT, "index.html"), "utf8");
  check(
    "HTML launcher embeds styles without dependencies",
    html.includes("<style>") &&
      !/<script[^>]+\bsrc=|type="module"|<link[^>]+rel="stylesheet"/i.test(
        html,
      ),
  );
  await launcher.goto(staticBase + "/index.html");
  await launcher.setViewportSize({ width: 320, height: 740 });
  await cleanLayout(launcher, "320px standalone launcher");
  check("no uncaught JavaScript or console errors", errors.length === 0);
  await writeFile(
    join(OUT, "results.json"),
    JSON.stringify(
      {
        date: new Date().toISOString(),
        browser: browser.version(),
        viewports: sizes,
        passed: checks.length,
        checks,
        errors,
        scope:
          "Database-backed Java HTTP app and standalone launcher served over HTTP. Mobile sizes use Chromium emulation; physical Android/iOS and direct file:// navigation are not covered.",
      },
      null,
      2,
    ),
  );
  console.log("\n" + checks.length + " browser checks passed.");
} catch (e) {
  await writeFile(
    join(OUT, "failure.txt"),
    e.stack +
      "\n\nJava log:\n" +
      log +
      "\nConsole errors:\n" +
      errors.join("\n"),
  );
  if (browser) {
    for (const context of browser.contexts())
      for (const page of context.pages())
        await page
          .screenshot({
            path: join(
              OUT,
              "failure-" +
                context.pages().indexOf(page) +
                "-" +
                Date.now() +
                ".png",
            ),
            fullPage: true,
          })
          .catch(() => {});
  }
  throw e;
} finally {
  await browser?.close();
  await stop(java);
  await stop(staticServer);
  await rm(temp, { recursive: true, force: true });
}
