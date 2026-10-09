/** Exact-money calculations, CSV validation, and accessible rendered markup. */
import assert from "node:assert/strict";
import vm from "node:vm";
import { readFile, mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import * as logic from "../dist/logic.js";
let checks = 0;
const check = (name, fn) => {
  fn();
  checks++;
  console.log("PASS " + name);
};
const {
  cents,
  validDate,
  monthShift,
  validateTransaction,
  parseCSV,
  parseImport,
  summary,
  today,
  total,
  breakdown,
} = logic;
check("exact decimal addition", () =>
  assert.equal(cents("0.10") + cents("0.20"), 30),
);
check("invalid amounts are rejected", () => {
  for (const s of ["0", "-1", "Infinity", "NaN", "1e3", "1.005", "1000000000"])
    assert.throws(() => cents(s));
});
check("calendar dates and month boundaries", () => {
  assert(validDate("2024-02-29"));
  assert(!validDate("2026-02-29"));
  assert.equal(monthShift("2026-01", -1), "2025-12");
});
check("transaction validation rejects invalid classification", () =>
  assert.throws(() =>
    validateTransaction({
      date: today(),
      description: "Test",
      amount: "1",
      category: "Bogus",
      method: "Cash",
      type: "expense",
    }),
  ),
);
check("CSV quoted fields and CRLF", () =>
  assert.deepEqual(parseCSV('\ufeffa,b\r\n"tea, coffee","two\nlines"\r\n'), [
    ["a", "b"],
    ["tea, coffee", "two\nlines"],
  ]),
);
check("invalid CSV quoting rejected", () =>
  assert.throws(() => parseCSV('a,b\n"bad,value')),
);
const workspace = {
  profile: {
    id: "test-user",
    name: "Test User",
    email: "user@example.test",
    role: "USER",
    share: false,
  },
  viewer: { id: "test-user", name: "Test User", role: "USER", readOnly: false },
  transactions: [
    {
      id: "t1",
      date: today(),
      description: "Test lunch",
      amount: "25.50",
      category: "Food",
      method: "Cash",
      type: "expense",
      notes: "",
      source: "manual",
      inboxId: "",
    },
    {
      id: "t2",
      date: today(),
      description: "Income",
      amount: "1000.00",
      category: "Other",
      method: "Bank",
      type: "income",
      notes: "",
      source: "manual",
      inboxId: "",
    },
  ],
  budgets: [
    {
      id: "b1",
      month: today().slice(0, 7),
      category: "Overall",
      amount: "2000.00",
    },
  ],
  inbox: [],
  audit: [],
  integration: { live: false, adapterConfigured: true, allowed: false },
  adminName: "Test Admin",
};
const csv =
  "transaction_id,date,description,amount,direction,method,account\r\nTEST-1," +
  today() +
  ",Cafe,25.50,DEBIT,UPI,Test bank\r\n";
workspace.inbox = parseImport(workspace, { csv }).rows;
const sm = summary(workspace, today().slice(0, 7));
check("pending imports do not inflate spending", () =>
  assert.equal(sm.spent, 2550),
);
check("income and spending are separate", () =>
  assert.equal(sm.income, 100000),
);
check("category breakdown reconciles to spending", () =>
  assert.equal(
    breakdown(sm.expenses).reduce((n, c) => n + c.value, 0),
    sm.spent,
  ),
);
check("CSV creates pending statement rows", () =>
  assert.equal(workspace.inbox[0].status, "pending"),
);
check("repeated statement references are deduplicated", () =>
  assert.equal(parseImport(workspace, { csv }).newCount, 0),
);
check("conflicting duplicate within CSV rejected", () =>
  assert.throws(() =>
    parseImport(workspace, {
      csv: csv + csv.split("\r\n")[1].replace("25.50", "30.50") + "\r\n",
    }),
  ),
);
// Render the actual source, with API answers supplied only for the account directory.
const domRoot = { innerHTML: "", querySelector: () => null },
  dialog = {
    innerHTML: "",
    open: false,
    className: "",
    addEventListener() {},
    showModal() {
      this.open = true;
    },
    close() {
      this.open = false;
    },
    querySelector() {
      return null;
    },
  };
const document = {
  querySelector(sel) {
    return sel === "#app"
      ? domRoot
      : sel === "#modal"
        ? dialog
        : { append() {}, setAttribute() {} };
  },
  addEventListener() {},
  createElement() {
    return { remove() {}, click() {}, set textContent(v) {} };
  },
  activeElement: { tagName: "BODY" },
  hidden: false,
};
const directory = {
  users: [
    {
      id: "test-user",
      name: "Test User",
      email: "user@example.test",
      share: true,
      spent: "25.50",
      pending: 1,
    },
  ],
  month: today().slice(0, 7),
};
const context = vm.createContext({
  ...logic,
  document,
  window: { scrollTo() {} },
  location: { hash: "", pathname: "/" },
  history: { replaceState() {} },
  navigator: {},
  fetch: async () => ({ ok: true, json: async () => directory }),
  console,
  Intl,
  Date,
  URLSearchParams,
  URL,
  Blob,
  structuredClone,
  crypto,
  setTimeout: () => 0,
  setInterval: () => 0,
});
let app = await readFile(new URL("../dist/app.js", import.meta.url), "utf8");
app = app.replace(/^import[\s\S]*?;\n/gm, "").replace(/init\(\);\s*$/, "");
vm.runInContext(
  app +
    `\nglobalThis.ui={enterWorkspace,navigate,perform,transactionDialog,budgetDialog,reviewDialog,mappingDialog,legacyDialog,closeModal,renderAuth,setPublic(v){publicInfo=v},setProfileName(v){state.profile.name=v},get state(){return state},get page(){return page}};`,
  context,
);
const ui = context.ui,
  markup = [];
function capture(name) {
  markup.push({
    name,
    html: domRoot.innerHTML + (dialog.open ? dialog.innerHTML : ""),
  });
  check(name + " renders clean numeric values", () => {
    assert(!/NaN|undefined/.test(domRoot.innerHTML));
    assert(domRoot.innerHTML.length > 100);
  });
}
ui.setPublic({ setupRequired: false, adminName: "Test Admin" });
ui.renderAuth();
capture("Front-page login choices");
check("front page offers admin and normal user logins", () => {
  assert.match(domRoot.innerHTML, /Admin login/);
  assert.match(domRoot.innerHTML, /User login/);
});
check("front page has no temporary workspace or recovery controls", () =>
  assert(!/sample|demo|forgot password/i.test(domRoot.innerHTML)),
);
await ui.perform("login-choice", { dataset: { role: "user" } });
capture("Normal user sign-in");
check("normal user sign-in offers registration", () =>
  assert.match(domRoot.innerHTML, /Create an account/),
);
await ui.perform("auth-switch", { dataset: {} });
capture("Registration");
await ui.perform("login-choice", { dataset: { role: "admin" } });
capture("Admin sign-in");
check("admin sign-in cannot create administrator accounts", () =>
  assert(!/Create an account|Create my tracker/.test(domRoot.innerHTML)),
);
await ui.enterWorkspace(structuredClone(workspace));
check("user enters the overview", () => assert.equal(ui.page, "overview"));
for (const page of [
  "overview",
  "transactions",
  "inbox",
  "budgets",
  "reports",
  "imports",
  "settings",
]) {
  await ui.navigate(page);
  capture("Personal " + page);
}
await ui.navigate("overview");
ui.transactionDialog("", true);
capture("Cash entry dialog");
check("cash entry defaults to cash", () =>
  assert.match(dialog.innerHTML, /<option value="Cash" selected>/),
);
ui.closeModal();
ui.budgetDialog("Food");
capture("Category budget dialog");
ui.closeModal();
for (const tab of ["categorize", "match", "ignore"]) {
  ui.reviewDialog(ui.state.inbox[0].id, tab);
  capture("Review " + tab + " dialog");
}
ui.closeModal();
ui.mappingDialog(csv);
capture("Statement mapping dialog");
ui.closeModal();
ui.legacyDialog();
capture("Previous-data import dialog");
ui.closeModal();
ui.setProfileName("<img src=x onerror=alert(1)>");
await ui.navigate("settings");
check("profile text is escaped", () => {
  assert(!domRoot.innerHTML.includes("<img src=x"));
  assert(domRoot.innerHTML.includes("&lt;img"));
});
const admin = structuredClone(workspace);
admin.profile.id = "admin";
admin.profile.role = "ADMIN";
admin.viewer = {
  id: "admin",
  name: "Test Admin",
  role: "ADMIN",
  readOnly: false,
};
await ui.enterWorkspace(admin);
capture("Admin dashboard");
check("admin enters the account directory", () =>
  assert.equal(ui.page, "admin"),
);
const shared = structuredClone(workspace);
shared.viewer = {
  id: "admin",
  name: "Test Admin",
  role: "ADMIN",
  readOnly: true,
};
await ui.enterWorkspace(shared);
await ui.navigate("overview");
capture("Shared read-only tracker");
check("shared tracker hides mutation controls", () =>
  assert(
    !/data-action="(?:add|cash|edit|delete|export|budget)"/.test(
      domRoot.innerHTML,
    ),
  ),
);
check("manual editor cannot open in a shared view", () =>
  assert.throws(() => ui.transactionDialog()),
);
const temp = await mkdtemp(join(tmpdir(), "expense-ui-"));
try {
  await writeFile(join(temp, "markup.json"), JSON.stringify(markup));
  const result = spawnSync(
    "python3",
    [
      new URL("./validate_markup.py", import.meta.url).pathname,
      join(temp, "markup.json"),
    ],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stdout + result.stderr);
  check("pages and dialogs have valid IDs, labels and button types", () =>
    assert.match(result.stdout, /PASS/),
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
console.log(
  "\n" +
    checks +
    " frontend checks passed. Layout is verified separately in a browser.",
);
