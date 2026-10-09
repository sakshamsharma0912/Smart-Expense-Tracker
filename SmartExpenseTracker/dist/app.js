import {
  categories,
  methods,
  types,
  today,
  cents,
  decimal,
  total,
  summary,
  sorted,
  monthly,
  breakdown,
  monthShift,
  parseCSV,
  autoMapping,
  directionOK,
} from "./logic.js";

const root = document.querySelector("#app"),
  modal = document.querySelector("#modal");
const setupKey = new URLSearchParams(location.hash.slice(1)).get("setup") || "";
if (setupKey) history.replaceState(null, "", location.pathname);
let state = null,
  page = "overview",
  month = today().slice(0, 7),
  authMode = "login",
  authPortal = new URLSearchParams(location.hash.slice(1)).get("login") || "",
  publicInfo = {},
  directory = null;
let filters = { search: "", category: "", type: "", method: "", all: false },
  inboxTab = "pending",
  modalContext = {},
  busy = false,
  refreshing = false;
const dismissed = new Set();
const labels = {
  overview: "Overview",
  transactions: "Transactions",
  inbox: "Review inbox",
  budgets: "Budgets",
  reports: "Reports",
  imports: "Bank imports",
  settings: "Settings",
  admin: "Admin dashboard",
};
const paths = {
  wallet:
    "M3 7a2 2 0 0 1 2-2h14v4H5a2 2 0 0 1 0-4 M3 7v12a2 2 0 0 0 2 2h16V9H5 M17 13h4v4h-4z",
  grid: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  list: "M8 6h13 M8 12h13 M8 18h13 M3 6h.01 M3 12h.01 M3 18h.01",
  inbox: "M4 4h16l2 12v4H2v-4z M2 16h6l2 3h4l2-3h6",
  target: "M21 12a9 9 0 1 1-9-9 M12 7a5 5 0 1 0 5 5 M12 12l9-9 M16 3h5v5",
  chart: "M4 3v18h18 M8 16v-5 M13 16V7 M18 16V4",
  bank: "M3 9h18L12 3z M3 21h18 M6 10v8 M12 10v8 M18 10v8",
  settings:
    "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M9 3h6l1 3 3 1 2 5-2 5-3 1-1 3H9l-1-3-3-1-2-5 2-5 3-1z",
  users:
    "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M2 21v-3a6 6 0 0 1 12 0v3 M17 3a4 4 0 0 1 0 8 M17 15a5 5 0 0 1 5 5v1",
  logout: "M10 3H3v18h7 M9 12h12 M17 8l4 4-4 4",
  plus: "M12 5v14 M5 12h14",
  arrow: "M5 12h14 M14 7l5 5-5 5",
  down: "M12 3v12 M7 10l5 5 5-5 M4 17v4h16v-4",
  up: "M12 21V9 M7 14l5-5 5 5 M4 7V3h16v4",
  chevron: "M9 5l7 7-7 7",
  search: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l6 6",
  edit: "M15 5l4 4 M3 21l5-1L21 7a2 2 0 0 0-4-4L4 16z",
  trash: "M3 6h18 M9 6V3h6v3 M5 6l1 15h12l1-15 M10 10v7 M14 10v7",
  close: "M6 6l12 12 M6 18 18 6",
  menu: "M3 6h18 M3 12h18 M3 18h18",
  shield: "M12 3l8 3v6c0 5-8 9-8 9s-8-4-8-9V6z M8 12l3 3 5-6",
  lock: "M6 10h12v11H6z M8 10V7a4 4 0 0 1 8 0v3",
  check: "M5 12l4 4L20 5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M12 7v5l3 2",
  food: "M4 3v7h6V3 M7 3v18 M17 3v18 M17 3c-4 4-4 9 0 9",
  travel: "M5 17h14V5H5z M5 10h14 M7 17v3 M17 17v3 M8 14h.01 M16 14h.01",
  bag: "M5 7h14l2 14H3z M8 8V6a4 4 0 0 1 8 0v2",
  book: "M12 5v16 M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1",
  receipt: "M5 3l3 2 4-2 4 2 3-2v18l-3-2-4 2-4-2-3 2z M8 9h8 M8 13h8",
  heart: "M12 21S2 15 2 8a5 5 0 0 1 10-1 5 5 0 0 1 10 1c0 7-10 13-10 13z",
  play: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18 M10 8l6 4-6 4z",
  cash: "M2 5h20v14H2z M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8 M5 12h.01 M19 12h.01",
  upi: "M14 3 5 14h7l-2 7 9-11h-7z",
  card: "M2 5h20v14H2z M2 10h20 M5 15h5",
  refresh: "M20 7A9 9 0 1 0 21 15 M20 2v6h-6",
  eye: "M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6",
};
const icon = (name, extra = "") =>
  `<svg class="icon ${extra}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.wallet}"/></svg>`;
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
    minimumFractionDigits: n % 100 ? 2 : 0,
  }).format(n / 100);
const compact = (n) =>
  n >= 10000000
    ? "₹" + (n / 10000000).toFixed(1) + "L"
    : n >= 100000
      ? "₹" + (n / 100000).toFixed(1) + "k"
      : money(n);
const monthName = (m) =>
  new Date(m + "-01T12:00:00Z").toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
const dateLabel = (d) =>
  new Date(d + "T12:00:00Z").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
const cat = (name) =>
  categories.find((c) => c.name === name) || categories.at(-1);
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const initials = (name) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
const readonly = () => !!state?.viewer.readOnly;
const options = (values, selected) =>
  values
    .map(
      (v) =>
        `<option value="${esc(v)}" ${v === selected ? "selected" : ""}>${esc(cap(v))}</option>`,
    )
    .join("");
const button = (label, action, style = "", extra = "") =>
  `<button type="button" class="btn ${style}" data-action="${action}" ${extra}><span class="btn-label">${label}</span></button>`;
const empty = (title, detail) =>
  `<div class="empty">${icon("inbox")}<h3>${esc(title)}</h3><p>${esc(detail)}</p></div>`;
const brand = () =>
  `<div class="brand"><span class="brand-mark">${icon("wallet")}</span><div>Smart Expense<span><small>PERSONAL FINANCE TRACKER</small></span></div></div>`;
const stat = (label, value, note, ico = "wallet", color = "") =>
  `<div class="card stat"><div class="stat-top">${label}${icon(ico)}</div><div class="stat-value ${color}">${value}</div><p>${note}</p></div>`;
const field = (label, name, type = "text", value = "", attrs = "") =>
  `<div class="field"><label for="field-${name}">${label}</label><input id="field-${name}" name="${name}" type="${type}" value="${esc(value)}" ${attrs}></div>`;
const select = (label, name, values, value, attrs = "") =>
  `<div class="field"><label for="field-${name}">${label}</label><select id="field-${name}" name="${name}" ${attrs}>${options(values, value)}</select></div>`;
function toast(message, error = false) {
  const el = document.createElement("div");
  el.className = "toast" + (error ? " error" : "");
  el.textContent = message;
  document.querySelector("#toasts").append(el);
  setTimeout(() => el.remove(), 5500);
}
async function api(path, method = "GET", form = {}) {
  const r = await fetch("/api/" + path, {
    method,
    credentials: "same-origin",
    headers:
      method === "GET"
        ? {}
        : {
            "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
            "X-Requested-With": "ExpenseTracker",
          },
    body: method === "GET" ? undefined : new URLSearchParams(form),
  });
  let data;
  try {
    data = await r.json();
  } catch {
    throw Error(
      "The server returned an unreadable response. Check the Java window.",
    );
  }
  if (!r.ok) {
    const e = Error(data.error || "This request could not be completed.");
    e.status = r.status;
    throw e;
  }
  return data;
}
function formData(form) {
  const f = Object.fromEntries(new FormData(form));
  form.querySelectorAll("input[type=checkbox]").forEach((el) => {
    f[el.name] = String(el.checked);
  });
  return f;
}
function guard() {
  if (readonly())
    throw Error(
      "This is a read-only view. Return to your tracker to make changes.",
    );
}
function showModal(title, subtitle, body, wide = false) {
  modal.className = wide ? "wide-modal" : "";
  modal.innerHTML = `<div class="modal-head"><div><h2 id="modal-title">${esc(title)}</h2><p>${esc(subtitle)}</p></div><button type="button" class="icon-btn" data-action="close" aria-label="Close dialog">${icon("close")}</button></div>${body}`;
  if (!modal.open) modal.showModal();
}
function closeModal() {
  if (modalContext.kind === "review") dismissed.add(modalContext.id);
  modal.close();
  modal.innerHTML = "";
  modalContext = {};
}
const errorBox = '<div class="error" role="alert" data-error></div>';
const actions = (label) =>
  `<div class="form-actions">${button("Cancel", "close")}<button class="btn primary" type="submit">${label}</button></div>`;
function renderAuth() {
  const setup = publicInfo.setupRequired && !!setupKey,
    chosen = ["user", "admin"].includes(authPortal),
    admin = authPortal === "admin",
    register = authMode === "register" && !admin && !setup;
  const title = setup
    ? "Create your admin account."
    : register
      ? "Create your tracker."
      : chosen
        ? admin
          ? "Admin login."
          : "User login."
        : "Choose your workspace.";
  let body;
  if (publicInfo.setupRequired && !setup) {
    body =
      '<div class="notice">Open the setup link printed in the Java window on the server computer to create the first admin account.</div>';
  } else if (!setup && !chosen) {
    body = `<div class="login-choices"><button type="button" class="login-choice" data-action="login-choice" data-role="user">${icon("wallet")}<span><strong>User login</strong><small>Your expenses, budgets and reports.</small></span>${icon("arrow")}</button><button type="button" class="login-choice" data-action="login-choice" data-role="admin">${icon("shield")}<span><strong>Admin login</strong><small>Accounts and shared trackers.</small></span>${icon("arrow")}</button></div><p class="auth-fine">New here? Choose user login to create your account.</p>`;
  } else {
    body = `${!setup ? '<button type="button" class="auth-back" data-action="login-back">← Choose another workspace</button>' : ""}<form data-form="auth">${setup || register ? field("Your name", "name", "text", "", 'required maxlength="60" autocomplete="name"') : ""}${field("Email address", "email", "email", "", 'required maxlength="120" autocomplete="username"')}${field("Password", "password", "password", "", `required minlength="10" maxlength="128" autocomplete="${setup || register ? "new-password" : "current-password"}"`)}${setup || register ? '<p class="fine muted">Use at least 10 characters.</p>' : ""}${register ? `<div class="auth-notice">${esc(publicInfo.adminName)} runs this app and can see your account name and email. Your financial tracker is private unless you enable sharing.</div><label class="check"><input type="checkbox" name="noticeAccepted" required> I understand the account privacy notice.</label><label class="check"><input type="checkbox" name="share"> Allow ${esc(publicInfo.adminName)} to view my tracker. I can turn this off later.</label>` : ""}${errorBox}<button type="submit" class="btn primary">${setup ? "Create admin account" : register ? "Create my tracker" : admin ? "Sign in as admin" : "Sign in as user"} ${icon("arrow")}</button></form>${setup || admin ? "" : `<div class="auth-switch">${register ? "Already have an account?" : "New here?"} <button type="button" data-action="auth-switch">${register ? "Sign in" : "Create an account"}</button></div>`}`;
  }
  root.innerHTML = `<div class="auth"><section class="auth-story">${brand()}<div><div class="eyebrow">YOUR MONEY. A CLEARER PICTURE.</div><h1>Know where<br>your money<br><span>goes.</span></h1><p class="intro">A simple record of what comes in, what goes out, and what you have planned. Cash and digital payments, in one place.</p><div class="auth-features"><div><span>01</span><p>Record the everyday.<small>Cash, UPI, card and bank payments.</small></p></div><div><span>02</span><p>Make room for your plans.<small>Monthly limits and category budgets.</small></p></div><div><span>03</span><p>See the whole picture.<small>Spending patterns, month by month.</small></p></div></div></div><footer>Expenses · Budgets · Reports / INR ₹</footer></section><section class="auth-main" id="main-content" tabindex="-1"><div class="auth-box"><div class="auth-mobile-brand">${brand()}</div><div class="eyebrow">${setup ? "FIRST-TIME SETUP" : admin ? "ADMINISTRATION" : chosen ? "PERSONAL WORKSPACE" : "SMART EXPENSE TRACKER"}</div><h2>${title}</h2><p>${setup ? "Create the administrator account for this installation." : register ? "A private space for your expenses and budgets." : chosen ? (admin ? "Sign in to manage accounts and view shared trackers." : "Sign in to pick up where you left off.") : "Sign in to your personal tracker or open the admin dashboard."}</p>${body}</div></section></div>`;
}
function heading(title, subtitle, extra = "", showMonth = true) {
  return `<div class="page-heading"><div><h1 tabindex="-1"><span class="text-hover">${esc(title)}</span></h1><p>${esc(subtitle)}</p></div><div class="heading-actions">${showMonth ? `<input aria-label="Reporting month" class="month-input" type="month" id="report-month" value="${esc(month)}" min="1900-01" max="2100-12">` : ""}${extra}</div></div>`;
}
function render() {
  if (!state) {
    renderAuth();
    return;
  }
  const a = state.profile,
    sm = summary(state, month),
    admin = state.viewer.role === "ADMIN";
  const nav = [
    ["overview", "grid"],
    ["transactions", "list"],
    ["inbox", "inbox"],
    ["budgets", "target"],
    ["reports", "chart"],
    ...(!readonly() ? [["imports", "bank"]] : []),
  ];
  const personal =
    page === "admin"
      ? "Admin console"
      : readonly()
        ? a.name + "’s tracker"
        : "My workspace";
  root.innerHTML = `<div class="shell"><aside class="sidebar" id="workspace-navigation">${brand()}<button type="button" class="icon-btn mobile-close" data-action="menu-close" aria-label="Close navigation">${icon("close")}</button><div class="nav-label">WORKSPACE</div><nav class="navigation" aria-label="Main navigation">${admin ? `<button type="button" class="nav-item ${page === "admin" ? "active" : ""}" data-action="admin">${icon("users")}<span class="nav-text">Admin dashboard</span></button>` : ""}${nav.map(([p, i]) => `<button type="button" class="nav-item ${page === p ? "active" : ""}" data-page="${p}" ${page === p ? 'aria-current="page"' : ""}>${icon(i)}<span class="nav-text">${labels[p]}</span>${p === "inbox" && sm.pending ? `<span class="badge-count">${sm.pending}</span>` : ""}</button>`).join("")}</nav><div class="side-bottom">${sm.budget && page !== "admin" ? `<div class="mini-budget"><div class="row between"><span>Monthly budget</span>${icon("target")}</div><strong>${money(Math.max(0, sm.left))}</strong><p>${sm.left >= 0 ? "left to spend" : money(-sm.left) + " over budget"}</p><div class="track"><span style="width:${Math.min(100, (sm.spent / sm.budget) * 100)}%"></span></div></div>` : ""}${!readonly() ? `<button type="button" class="nav-item ${page === "settings" ? "active" : ""}" data-page="settings">${icon("settings")}<span class="nav-text">Settings</span></button>` : ""}<button type="button" class="nav-item" data-action="logout">${icon("logout")}<span class="nav-text">Sign out</span></button><div class="account"><span class="avatar">${esc(initials(state.viewer.name))}</span><div><strong>${esc(state.viewer.name)}</strong><small>${admin ? "Admin account" : "Personal account"}</small></div></div></div></aside><button type="button" class="nav-scrim" data-action="menu-close" aria-label="Close navigation backdrop" tabindex="-1"></button><main class="main" id="main-content" tabindex="-1"><header class="topbar"><div class="row"><button type="button" class="icon-btn mobile-menu" data-action="menu" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded="false">${icon("menu")}</button><div class="breadcrumb">${esc(personal)}<span>/ ${labels[page]}</span></div></div><div class="topbar-right"><span class="pill mint">${admin ? "Admin" : "Personal"} workspace</span><button type="button" class="icon-btn" data-page="inbox" aria-label="Open review inbox">${icon("inbox")}</button><span class="avatar">${esc(initials(a.name))}</span></div></header><div class="content">${readonly() ? `<div class="view-banner">${icon("lock")}<span>Viewing <strong>${esc(a.name)}’s tracker</strong> with permission. This view is read-only and logged.</span>${button("Back to admin", "admin", "sm")}</div>` : ""}<div id="connection-error" class="connection-error" hidden></div>${pageContent()}<footer class="footer"><span>Smart Expense Tracker</span><span>${readonly() ? "Read-only shared view" : "Saved to your account"} · INR ₹</span></footer></div></main></div>`;
}
function pageContent() {
  return (
    {
      overview: overview,
      transactions: transactionsPage,
      inbox: inboxPage,
      budgets: budgetsPage,
      reports: reportsPage,
      imports: importsPage,
      settings: settingsPage,
      admin: adminPage,
    }[page] || overview
  )();
}
function cumulativeChart(sm) {
  const n = new Date(
      Number(month.slice(0, 4)),
      Number(month.slice(5)),
      0,
    ).getDate(),
    daily = Array(n).fill(0);
  sm.expenses.forEach(
    (t) => (daily[Number(t.date.slice(8)) - 1] += cents(t.amount)),
  );
  let sum = 0;
  const vals = daily.map((v) => (sum += v)),
    max = Math.max(...vals, 1),
    pts = vals
      .map((v, i) => `${(i * 280) / (n - 1)},${82 - (v / max) * 70}`)
      .join(" ");
  return `<svg viewBox="0 0 280 94" role="img" aria-label="Cumulative spending through ${esc(monthName(month))}"><path d="M0 84H280 M0 46H280 M0 8H280" stroke="#6e805b" stroke-opacity=".3" stroke-dasharray="3 5"/><polygon points="0,94 ${pts} 280,94" fill="#cbe7a1" opacity=".09"/><polyline points="${pts}" fill="none" stroke="#cbe7a1" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function barChart() {
  const months = Array.from({ length: 6 }, (_, i) => monthShift(month, i - 5)),
    vals = months.map((m) =>
      total(monthly(state.transactions, m).filter((t) => t.type === "expense")),
    ),
    max = Math.max(...vals, 10000),
    ceil = Math.ceil(max / 100000) * 100000;
  return `<div class="bar-chart"><svg viewBox="0 0 530 224" role="img" aria-label="Monthly spending: ${esc(months.map((m, i) => monthName(m) + " " + money(vals[i])).join("; "))}">${[
    0, 1, 2, 3,
  ]
    .map((i) => {
      const y = 175 - i * 49;
      return `<path d="M58 ${y}H522" stroke="#343e2c" stroke-dasharray="3 5"/><text x="8" y="${y + 4}" fill="#9bab8d" text-anchor="start" font-size="10">${compact((ceil * i) / 3)}</text>`;
    })
    .join("")}${months
    .map((m, i) => {
      const h = Math.max(vals[i] > 0 ? 3 : 0, (vals[i] / ceil) * 147),
        x = 80 + i * 76;
      return `<rect class="chart-bar" x="${x}" y="${175 - h}" width="32" height="${h}" rx="3" fill="${i === 5 ? "#cbe7a1" : "#58694a"}"><title>${esc(monthName(m))}: ${money(vals[i])}</title></rect><text x="${x + 16}" y="204" fill="${i === 5 ? "#e6edda" : "#9bab8d"}" text-anchor="middle" font-size="11">${new Date(m + "-01T12:00:00Z").toLocaleDateString("en-IN", { month: "short", timeZone: "UTC" })}</text>`;
    })
    .join("")}</svg></div>`;
}
function donut(rows) {
  const values = breakdown(rows),
    sum = total(rows),
    r = 65,
    circ = 2 * Math.PI * r;
  let offset = 0;
  return `<div class="donut-area"><div class="donut-wrap"><svg viewBox="0 0 168 168" aria-hidden="true"><circle cx="84" cy="84" r="${r}" fill="none" stroke="#343e2c" stroke-width="17"/>${values
    .map((v) => {
      const size = (v.value / (sum || 1)) * circ,
        out = `<circle cx="84" cy="84" r="${r}" fill="none" stroke="${v.color}" stroke-width="17" stroke-dasharray="${Math.max(0, size - 3)} ${circ}" stroke-dashoffset="${-offset}"/>`;
      offset += size;
      return out;
    })
    .join(
      "",
    )}</svg><div class="donut-center"><small>TOTAL SPENT</small><strong>${compact(sum)}</strong><small>${values.length} categories</small></div></div><div class="category-legend">${values.length ? values.map((v) => `<div class="legend-row"><span class="legend-dot" style="background:${v.color}"></span><span>${v.name}</span><strong>${money(v.value)}</strong></div>`).join("") : '<p class="muted small">Your category breakdown will appear here.</p>'}</div></div>`;
}
function overview() {
  const sm = summary(state, month),
    name = state.profile.name.split(" ")[0];
  return `${heading(readonly() ? name + "’s overview" : "Overview", "Your spending, budgets and recent transactions.", !readonly() ? button(icon("plus") + " Add expense", "add", "primary") : "")}
<div class="hero-grid"><section class="card spend-hero"><div><div class="eyebrow">TOTAL SPENT · ${esc(monthName(month).toUpperCase())}</div><div class="hero-amount">${money(sm.spent)}</div><div class="hero-note">${sm.budget ? `${money(Math.abs(sm.left))} ${sm.left >= 0 ? "left in your budget" : "over your budget"}` : "Set a budget to track your remaining allowance."}</div><span class="pill mint">${sm.expenses.length} recorded expense${sm.expenses.length === 1 ? "" : "s"}</span></div><div class="hero-chart">${cumulativeChart(sm)}<p class="fine muted">Cumulative spending this month</p></div></section><section class="card review-hero"><div><div class="row between"><div class="eyebrow">PAYMENT REVIEW</div><span class="review-count">${sm.pending}</span></div><h2>${sm.pending ? sm.pending + " payments to review." : "Your inbox is clear."}</h2><p>${sm.pending ? "Review imported payments before they join your expenses." : "New statement entries will wait here for your review."}</p></div>${button(sm.pending ? "Review transactions " + icon("arrow") : "Open review inbox " + icon("arrow"), "navigate", "", 'data-target="inbox"')}</section></div>
<div class="stats">${stat("Money in", money(sm.income), "Recorded income this month", "down", "mint")}${stat("Budget remaining", sm.budget ? money(sm.left) : "Not set", sm.budget ? "Expenses against your plan" : "Set a limit in Budgets", "target", sm.left < 0 ? "red" : "")}${stat("Paid with UPI", money(sm.upi), "Categorised UPI expenses", "upi")}${stat("Paid with cash", money(sm.cash), "Manual and imported cash entries", "cash")}</div>
<div class="charts-grid"><section class="card"><div class="card-head"><div><h2>Monthly spending</h2><p>Six months at a glance</p></div><span class="pill lav">Monthly</span></div>${barChart()}<div class="chart-footer"><span class="legend-dot"></span>Expenses only · pending payments and transfers excluded</div></section><section class="card category-card"><div class="card-head"><div><h2>Spending by category</h2><p>Your monthly expense breakdown</p></div></div>${donut(sm.expenses)}<div class="budget-balance"><div class="row between"><span>Budget used</span><strong>${sm.budget ? Math.round((sm.spent / sm.budget) * 100) + "%" : "Not set"}</strong></div><div class="track"><span style="width:${sm.budget ? Math.min(100, (sm.spent / sm.budget) * 100) : 0}%"></span></div></div></section></div>
<section class="card"><div class="card-head"><div><h2>Recent transactions</h2><p>Your latest recorded entries</p></div><button type="button" class="text-btn" data-page="transactions">View all ${icon("arrow")}</button></div>${ledgerTable(sorted(sm.rows).slice(0, 5), false)}${sm.pending ? '<div class="table-foot">Pending imports are waiting in your review inbox and are not included in these totals.</div>' : ""}</section>`;
}
function ledgerTable(rows, controls = true) {
  if (!rows.length)
    return empty(
      "A fresh start",
      "Add a cash expense or import a bank statement to begin.",
    );
  return `<div class="table-wrap"><table class="ledger-table"><thead><tr><th>Description</th><th>Date</th><th>Category</th><th>Payment</th><th style="text-align:right">Amount</th>${controls && !readonly() ? '<th><span class="sr-only">Actions</span></th>' : ""}</tr></thead><tbody>${rows
    .map((t) => {
      const c = cat(t.category),
        credit = ["income", "refund"].includes(t.type);
      return `<tr><td><div class="description-cell"><span class="category-icon" style="--c:${c.color}">${icon(c.icon)}</span><div><strong title="${esc(t.description)}">${esc(t.description)}</strong><small>${cap(t.type)}${t.inboxId ? " · linked import" : ""}</small></div></div></td><td>${dateLabel(t.date)}</td><td><span class="category-pill" style="--c:${c.color}">${c.name}</span></td><td>${esc(t.method)}</td><td class="amount-cell ${credit ? "credit" : ""}">${credit ? "+" : t.type === "expense" ? "−" : ""}${money(cents(t.amount))}</td>${controls && !readonly() ? `<td><div class="row-actions"><button type="button" class="icon-btn" data-action="edit" data-id="${esc(t.id)}" aria-label="Edit ${esc(t.description)}">${icon("edit")}</button><button type="button" class="icon-btn" data-action="delete" data-id="${esc(t.id)}" aria-label="Delete ${esc(t.description)}">${icon("trash")}</button></div></td>` : ""}</tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function filteredTransactions() {
  return sorted(
    state.transactions.filter(
      (t) =>
        (filters.all || t.date.startsWith(month)) &&
        (!filters.category || t.category === filters.category) &&
        (!filters.method || t.method === filters.method) &&
        (!filters.type || t.type === filters.type) &&
        (!filters.search ||
          (t.description + " " + t.notes)
            .toLowerCase()
            .includes(filters.search.toLowerCase())),
    ),
  );
}
function transactionsPage() {
  const rows = filteredTransactions();
  return `${heading("Transactions", "Cash, digital payments and money coming in, together.", !readonly() ? button(icon("plus") + " Add transaction", "add", "primary") : "")}<div class="toolbar"><div class="search">${icon("search")}<input id="transaction-search" type="search" placeholder="Search description or notes" aria-label="Search transactions" value="${esc(filters.search)}"></div><div class="filters"><select aria-label="Filter category" data-filter="category"><option value="">All categories</option>${options(
    categories.map((c) => c.name),
    filters.category,
  )}</select><select aria-label="Filter type" data-filter="type"><option value="">All types</option>${options(types, filters.type)}</select><select aria-label="Filter payment method" data-filter="method"><option value="">All payments</option>${options(methods, filters.method)}</select><label class="check"><input type="checkbox" data-filter="all" ${filters.all ? "checked" : ""}>All months</label></div></div><section class="card"><div class="card-head"><div><h2 id="ledger-count">${rows.length} transaction${rows.length === 1 ? "" : "s"}</h2><p>${filters.all ? "All recorded months" : monthName(month)}</p></div>${!readonly() ? button(icon("down") + " Export CSV", "export", "sm") : ""}</div><div id="ledger-results">${ledgerTable(rows)}</div><div class="table-foot">Amounts are in INR. Transfers are kept separate from income and spending.</div></section>`;
}
function inboxPage() {
  const rows = state.inbox.filter((i) =>
    inboxTab === "reviewed"
      ? ["categorized", "matched"].includes(i.status)
      : i.status === inboxTab,
  );
  return `${heading("Review inbox", "Categorise an import, match an expense, or leave it out.", "", false)}<div class="toolbar"><div class="tabs" aria-label="Inbox status">${["pending", "reviewed", "ignored"].map((k) => button(cap(k), "inbox-tab", k === inboxTab ? "active" : "", `data-tab="${k}"`)).join("")}</div><span class="muted small">${rows.length} entr${rows.length === 1 ? "y" : "ies"} · all months</span></div><div class="notice ${inboxTab === "pending" ? "peach" : ""}" style="margin-bottom:22px">${inboxTab === "pending" ? "Pending entries do not affect your reports until you categorise or match them. Category suggestions use simple merchant keywords; you make the final choice." : inboxTab === "ignored" ? "Ignored references are remembered, so re-importing the same statement will not create duplicates. Restore an entry to review it again." : "Categorised and matched entries are already linked to your transaction ledger."}</div>${
    rows.length
      ? `<div class="inbox-grid">${sorted(rows)
          .map(
            (i) =>
              `<section class="card inbox-item"><div class="row between"><span class="inbox-icon">${icon(i.method === "UPI" ? "upi" : "bank")}</span><span class="pill peach">${i.source === "adapter" ? "Adapter import" : "Statement import"}</span></div><h2>${esc(i.description)}</h2><div class="inbox-amount">${i.direction === "CREDIT" ? "+" : "−"}${money(cents(i.amount))}</div><div class="inbox-meta">${dateLabel(i.date)} · ${esc(i.method)} · ${esc(i.account)}<br>Reference: ${esc(i.reference)}<br>${i.status === "pending" ? "Suggested: " + esc(i.suggested) : cap(i.status)}${i.note ? " · " + esc(i.note) : ""}</div><div class="inbox-actions"><span class="small muted">${i.direction === "CREDIT" ? "Money received" : "Money paid"}</span>${readonly() ? '<span class="pill">Read-only</span>' : i.status === "pending" ? button("Review " + icon("arrow"), "review", "primary sm", `data-id="${i.id}"`) : i.status === "ignored" ? button("Restore to inbox", "restore", "sm", `data-id="${i.id}"`) : button("View transaction", "edit", "sm", `data-id="${i.ledgerId}"`)}</div></section>`,
          )
          .join("")}</div>`
      : empty(
          inboxTab === "pending" ? "Your inbox is clear." : "Nothing here yet.",
          inboxTab === "pending"
            ? "New imported payments will appear here, ready to review."
            : "Reviewed entries will stay here for reference.",
        )
  }`;
}
function budgetsPage() {
  const sm = summary(state, month),
    pct = sm.budget ? Math.round((sm.spent / sm.budget) * 100) : 0;
  return `${heading("Budgets", "Set monthly limits for your spending.", !readonly() ? button(icon("plus") + " Set budget", "budget", "primary") : "")}<div class="budget-layout"><section class="card budget-main"><div class="eyebrow">OVERALL MONTHLY BUDGET</div><div class="budget-big">${sm.budget ? money(sm.budget) : "Not set"}</div><p class="small muted">${monthName(month)}</p><div class="budget-ring" style="--p:${Math.min(100, pct)}%"><div><strong>${pct}%</strong><small>OF BUDGET USED</small></div></div><div class="row between"><span class="muted small">Spent so far</span><strong>${money(sm.spent)}</strong></div><div class="divider"></div><div class="row between"><span class="muted small">${sm.left >= 0 ? "Remaining" : "Over budget"}</span><strong>${sm.budget ? money(Math.abs(sm.left)) : "—"}</strong></div>${!readonly() ? `<div style="margin-top:25px">${button("Edit monthly budget", "budget", "soft", 'data-category="Overall"')}</div>` : ""}</section><section class="card"><div class="card-head"><div><h2>Category budgets</h2><p>Category limits for ${monthName(month)}</p></div></div>${categories
    .map((c) => {
      const budget = state.budgets.find(
          (b) => b.month === month && b.category === c.name,
        ),
        limit = budget ? cents(budget.amount) : 0,
        spent = total(sm.expenses.filter((t) => t.category === c.name));
      return `<div class="category-budget"><div class="row between"><div class="row"><span class="category-icon" style="--c:${c.color}">${icon(c.icon)}</span><div><h3>${c.name}</h3><p>${money(spent)} ${limit ? "of " + money(limit) : "spent · no limit set"}</p></div></div>${!readonly() ? `<button type="button" class="icon-btn" data-action="budget" data-category="${c.name}" aria-label="Set ${c.name} budget">${icon("edit")}</button>` : ""}</div><div class="track"><span style="background:${spent > limit && limit ? "var(--red)" : c.color};width:${limit ? Math.min(100, (spent / limit) * 100) : 0}%"></span></div></div>`;
    })
    .join(
      "",
    )}<p class="fine muted" style="margin-top:20px">Category limits guide individual areas. They do not automatically change your overall budget.</p></section></div>`;
}
function reportsPage() {
  const sm = summary(state, month),
    b = breakdown(sm.expenses),
    previous = summary(state, monthShift(month, -1)),
    diff = sm.spent - previous.spent;
  return `${heading("Reports", "Patterns from your recorded income and expenses.", !readonly() ? button(icon("down") + " Export month", "export-month", "soft") : "")}<div class="stats">${stat("Total expenses", money(sm.spent), sm.expenses.length + " recorded expenses", "up")}${stat("Recorded income", money(sm.income), "Excludes refunds and transfers", "down", "mint")}${stat("Refunds received", money(sm.refunds), "Shown separately from income", "refresh")}${stat("Recorded net", money(sm.income + sm.refunds - sm.spent), "Income + refunds − expenses", "wallet")}</div><div class="report-grid"><section class="card"><div class="card-head"><div><h2>How you paid</h2><p>Expense amounts by payment method</p></div></div>${methods
    .map((m, i) => {
      let n = total(sm.expenses.filter((t) => t.method === m));
      return `<div class="payment-row"><div class="row between"><span class="row">${icon({ Cash: "cash", UPI: "upi", Card: "card", Bank: "bank" }[m] || "wallet")}${m}</span><strong>${money(n)}</strong></div><div class="track"><span style="background:${categories[i].color};width:${sm.spent ? (n / sm.spent) * 100 : 0}%"></span></div></div>`;
    })
    .join(
      "",
    )}</section><section class="card"><div class="card-head"><div><h2>Your category mix</h2><p>${monthName(month)}</p></div></div>${donut(sm.expenses)}<div class="divider"></div><p class="small muted">${b.length ? `${b[0].name} was your largest category at ${Math.round((b[0].value / sm.spent) * 100)}% of recorded spending.` : "Add expenses to see your category mix."}</p></section><section class="card"><div class="card-head"><div><h2>Compared with last month</h2><p>Recorded expenses, full calendar months</p></div></div><div class="insight-number">${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}</div><p class="small muted" style="margin-top:12px">${previous.spent ? Math.round((Math.abs(diff) / previous.spent) * 100) + "% " + (diff >= 0 ? "more" : "less") + " than " + monthName(monthShift(month, -1)) : "No spending was recorded in the previous month."}</p><p class="fine muted" style="margin-top:20px">The current month may be incomplete. This is a comparison of recorded entries, not a forecast.</p></section><section class="card"><div class="card-head"><div><h2>What these numbers include</h2><p>Clear inputs, clearer reports</p></div></div><div class="info-copy"><p>Only categorised ledger entries count. Your ${sm.pending} pending import${sm.pending === 1 ? "" : "s"} ${sm.pending === 1 ? "is" : "are"} waiting for review.</p><p>Transfers do not count as income or expenses. Refunds appear separately. “Recorded net” is not your bank balance.</p></div></section></div>`;
}
function importsPage() {
  return `${heading("Bank imports", "Import a statement, then decide where each payment belongs.", "", false)}<div class="import-grid"><section class="card"><div class="card-head"><div><h2>Import a bank statement</h2><p>A working way to bring in your UPI history</p></div><span class="pill mint">CSV</span></div><div class="upload-zone">${icon("up")}<h3>Choose your statement CSV</h3><p>Up to 2 MB. A unique transaction reference is required.</p><input id="statement-file" type="file" accept=".csv,text/csv" aria-label="Choose bank statement CSV"></div><button type="button" class="text-btn" data-action="template">Download example format ${icon("down")}</button>${[
    [
      "Map your columns",
      "Choose date, reference, description and amount columns.",
    ],
    [
      "Check the preview",
      "Review new entries and skipped duplicates before importing.",
    ],
    [
      "Categorise each payment",
      "Approve a category or match a payment you entered already.",
    ],
  ]
    .map(
      ([t, d], i) =>
        `<div class="import-step"><span class="step-num">${i + 1}</span><div><h3 class="small">${t}</h3><p>${d}</p></div></div>`,
    )
    .join(
      "",
    )}<p class="fine muted" style="margin-top:20px">Use a consistent, non-sensitive account label. Full account numbers and bank passwords are not needed.</p></section><section class="card"><div class="card-head"><div><h2>Review before you record.</h2><p>Keep every payment in the right place.</p></div></div><div class="info-copy"><p>Imported entries wait in your inbox until you approve them. Choose a category, record income or a refund, or ignore a payment that does not belong in your tracker.</p><p>Already entered the same payment? Match it to the existing transaction so your reports count it once.</p></div><div style="margin-top:23px">${button(icon("inbox") + " Open review inbox", "navigate", "soft", 'data-target="inbox"')}</div></section><section class="card"><div class="card-head"><div><h2>Moving from your old tracker?</h2><p>Keep the work you already put in.</p></div></div><p class="info-copy">Import your old <strong>expenses.csv</strong> and optional monthly budget. Existing entries stay intact, with the original dates and categories.</p><div style="margin-top:23px">${button(icon("up") + " Import old tracker data", "legacy", "soft")}</div></section><section class="card"><div class="card-head"><div><h2>Cash counts, too.</h2><p>A chai, a bus ride, a quick snack.</p></div></div><p class="info-copy">Add cash payments in a few seconds. If a later bank import matches something you entered manually, link it to the existing expense to avoid counting twice.</p><div style="margin-top:23px">${button(icon("cash") + " Add a cash expense", "cash", "primary")}</div></section></div>`;
}
function settingsPage() {
  const a = state.profile;
  return `${heading("Settings", "Manage your profile, sharing and import permissions.", "", false)}<div class="settings-grid"><section class="card"><div class="card-head"><div><h2>Profile & sharing</h2><p>${esc(a.email)}</p></div></div><form data-form="profile">${field("Display name", "name", "text", a.name, 'required maxlength="60"')}${a.role !== "ADMIN" ? `<label class="check"><input type="checkbox" name="share" ${a.share ? "checked" : ""}>Allow ${esc(state.adminName)} to view my tracker in their admin dashboard.</label><p class="fine muted">Sharing gives read-only access to transactions, budgets, imports and activity. You can revoke it here. Admin visits are recorded below. Your account name and email remain in the account directory.</p>` : '<p class="notice">You are the owner. Other users can choose to share their tracker with your admin account.</p>'}${errorBox}<div><button type="submit" class="btn primary">Save preferences</button></div></form></section><section class="card"><div class="card-head"><div><h2>Import permissions</h2><p>Control what enters your inbox</p></div></div><p class="info-copy">Bank connection: <strong>not connected</strong>. Statement imports are available now.</p>${state.integration.adapterConfigured ? `<form data-form="adapter" style="margin-top:20px"><label class="check"><input type="checkbox" name="allowed" ${state.integration.allowed ? "checked" : ""}>Allow the local transaction adapter to deliver entries to my inbox.</label><p class="fine muted">This is a permission for this app’s adapter. It does not create bank consent or connect an account. Your provider must handle bank authorisation separately.</p><p class="fine muted">Your adapter account reference: <code>${esc(a.id)}</code></p>${errorBox}<div><button type="submit" class="btn soft">Save import permission</button></div></form>` : '<div class="notice" style="margin-top:20px">The optional local adapter is not enabled in this workspace.</div>'}<div class="divider"></div><p class="fine muted">Your records are saved in the database on the computer running this app. Your account password is stored as a salted hash.</p></section><section class="card"><div class="card-head"><div><h2>Change password</h2><p>Keep your account secure</p></div></div><form data-form="password">${field("Current password", "currentPassword", "password", "", 'required maxlength="128" autocomplete="current-password"')}${field("New password", "newPassword", "password", "", 'required minlength="10" maxlength="128" autocomplete="new-password"')}${field("Confirm new password", "confirmPassword", "password", "", 'required minlength="10" maxlength="128" autocomplete="new-password"')}${errorBox}<div><button type="submit" class="btn primary">Change password</button></div></form></section><section class="card wide"><div class="card-head"><div><h2>Sharing & import activity</h2><p>Recent access and permission changes</p></div></div>${
    state.audit.length
      ? `<div class="audit-list">${state.audit
          .slice(0, 15)
          .map(
            (a) =>
              `<div class="audit-entry"><strong>${esc(a.event)}</strong><small>${esc(a.actor)} · ${new Date(a.at).toLocaleString("en-IN")}</small></div>`,
          )
          .join("")}</div>`
      : empty(
          "No activity yet",
          "Permission changes and administrator visits will appear here.",
        )
  }</section></div>`;
}
function adminPage() {
  const users = directory?.users || [],
    shared = users.filter((u) => u.share),
    amount = shared.reduce((n, u) => n + Math.round(Number(u.spent) * 100), 0),
    pending = shared.reduce((n, u) => n + Number(u.pending), 0);
  return `${heading("Admin dashboard", "A clear view of the accounts in your expense tracker.", button(icon("wallet") + " Open my tracker", "own", "primary"), false)}<div class="admin-intro">${icon("shield")}<div><h3>Account sharing is optional</h3><p>You can open trackers whose users enabled sharing. Visits are read-only and recorded in their activity log.</p></div></div><div class="stats admin-stats">${stat("Registered users", String(users.length), "Personal accounts in this workspace", "users")}${stat("Shared trackers", String(shared.length), "Users who enabled admin viewing", "eye", "mint")}${stat("Shared spending", money(amount), monthName(directory?.month || today().slice(0, 7)) + " · shared users only", "chart")}${stat("Awaiting review", String(pending), "Pending imports in shared trackers", "inbox")}</div><section class="card"><div class="card-head"><div><h2>Account directory</h2><p>Private users’ financial details stay hidden in this dashboard.</p></div>${button(icon("refresh") + " Refresh", "admin", "sm")}</div>${!directory ? '<p class="loading">Loading account directory…</p>' : users.length ? `<div class="table-wrap"><table class="directory-table"><thead><tr><th>User</th><th>Sharing</th><th>Monthly spending</th><th>Pending</th><th>Tracker</th></tr></thead><tbody>${users.map((u) => `<tr><td><div class="directory-name"><span class="avatar">${esc(initials(u.name))}</span><div><strong>${esc(u.name)}</strong><small>${esc(u.email)}</small></div></div></td><td><span class="pill ${u.share ? "mint" : ""}">${u.share ? "Shared" : "Private"}</span></td><td>${u.share ? money(Math.round(Number(u.spent) * 100)) : "—"}</td><td>${u.share ? Number(u.pending) : "—"}</td><td>${button(u.share ? "View tracker " + icon("arrow") : icon("lock") + " Private", "view", "sm", `data-id="${u.id}" ${u.share ? "" : "disabled"}`)}</td></tr>`).join("")}</tbody></table></div>` : empty("No user accounts yet", "Users can create a personal account from this app’s sign-in page.")}</section>`;
}
async function enterWorkspace(next) {
  state = next;
  directory = null;
  dismissed.clear();
  filters = { search: "", category: "", type: "", method: "", all: false };
  month = today().slice(0, 7);
  page = state.viewer.role === "ADMIN" ? "admin" : "overview";
  if (page === "admin") directory = await api("admin/users");
  render();
}
async function navigate(target) {
  if (target === "admin") {
    await openAdmin();
    return;
  }
  if (readonly() && ["settings", "imports"].includes(target)) return;
  page = target;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
  root.querySelector(".page-heading h1")?.focus?.({ preventScroll: true });
}
async function openAdmin() {
  if (state?.viewer.role !== "ADMIN")
    throw Error("Administrator access is required.");
  state = await api("state");
  directory = await api("admin/users");
  page = "admin";
  closeModal();
  render();
}
function transactionDialog(id = "", cash = false) {
  guard();
  const t = id ? state.transactions.find((t) => t.id === id) : null;
  if (id && !t) throw Error("This transaction is no longer available.");
  modalContext = { kind: "transaction", id, t };
  const linked = !!t?.inboxId;
  showModal(
    t ? "Edit transaction" : cash ? "Add a cash expense" : "Add a transaction",
    linked
      ? "The imported date, amount and payment method stay fixed."
      : "Enter the payment details below.",
    `<form data-form="transaction"><div class="form-grid">${field("Description", "description", "text", t?.description || "", 'required maxlength="100" placeholder="e.g. Lunch at the canteen"')}${field("Amount (₹)", "amount", "number", t?.amount || "", `required min="0.01" max="999999999.99" step="0.01" ${linked ? "disabled" : ""}`)}${field("Date", "date", "date", t?.date || today(), `required min="1900-01-01" max="2100-12-31" ${linked ? "disabled" : ""}`)}${select("Transaction type", "type", linked ? (state.inbox.find((i) => i.id === t.inboxId)?.direction === "CREDIT" ? ["income", "refund", "transfer"] : ["expense", "transfer"]) : types, t?.type || "expense")}${select(
      "Category",
      "category",
      categories.map((c) => c.name),
      t?.category || "Food",
    )}${select("Payment method", "method", methods, t?.method || (cash ? "Cash" : "UPI"), linked ? "disabled" : "")}<div class="field wide"><label for="field-notes">Notes (optional)</label><textarea id="field-notes" name="notes" maxlength="500" rows="2">${esc(t?.notes || "")}</textarea></div></div>${errorBox}${actions(t ? "Save changes" : "Add transaction")}</form>`,
  );
}
function budgetDialog(category = "Overall") {
  guard();
  const b = state.budgets.find(
    (b) => b.month === month && b.category === category,
  );
  modalContext = { kind: "budget" };
  showModal(
    "Set a budget for " + monthName(month),
    "Set an overall limit or a separate category budget.",
    `<form data-form="budget"><div class="form-grid">${field("Month", "month", "month", month, 'required min="1900-01" max="2100-12"')}${select("Budget for", "category", ["Overall", ...categories.map((c) => c.name)], category)}${field("Budget amount (₹)", "amount", "number", b?.amount || "", 'required min="0.01" max="999999999.99" step="0.01"')}</div>${errorBox}${actions("Save budget")}</form>`,
  );
}
function reviewDialog(id, tab = "categorize") {
  guard();
  const i = state.inbox.find((i) => i.id === id && i.status === "pending");
  if (!i) {
    toast("This entry has already been reviewed.");
    return;
  }
  modalContext = { kind: "review", id, tab };
  const eligible = state.transactions.filter(
    (t) =>
      !t.inboxId &&
      t.amount === i.amount &&
      directionOK(i, t.type) &&
      Math.abs(new Date(t.date) - new Date(i.date)) <= 259200000,
  );
  showModal(
    "Categorise this payment",
    "Review this imported entry before it joins your reports.",
    `<div class="review-transaction"><div class="row between"><strong>${i.direction === "CREDIT" ? "+" : "−"}${money(cents(i.amount))}</strong><span class="pill mint">${i.method}</span></div><h3>${esc(i.description)}</h3><p>${dateLabel(i.date)} · ${esc(i.account)}<br>Ref: ${esc(i.reference)}</p></div><div class="tabs review-tabs">${[
      ["categorize", "Categorise"],
      ["match", "Match existing"],
      ["ignore", "Ignore"],
    ]
      .map(([k, t]) =>
        button(t, "review-tab", k === tab ? "active" : "", `data-tab="${k}"`),
      )
      .join("")}</div><form data-form="review">${
      tab === "categorize"
        ? `${select("Record as", "type", i.direction === "DEBIT" ? ["expense", "transfer"] : ["income", "refund", "transfer"], i.direction === "DEBIT" ? "expense" : "income")}<p class="small muted" style="margin-top:19px">Choose a category · suggested: ${i.suggested}</p><input type="hidden" name="category" value="${i.suggested}"><div class="category-choices">${categories.map((c) => button(icon(c.icon) + c.name, "review-category", "category-choice" + (c.name === i.suggested ? " active" : ""), `data-category="${c.name}" style="--c:${c.color}" aria-pressed="${c.name === i.suggested}"`)).join("")}</div><div class="field"><label for="review-notes">Notes (optional)</label><textarea id="review-notes" name="notes" maxlength="500" rows="2"></textarea></div>`
        : tab === "match"
          ? `<p class="notice" style="margin-bottom:18px">Link to an existing entry with the same amount within 3 days. This keeps one ledger entry, updates its date and payment method from the import, and preserves your category and notes.</p>${
              eligible.length
                ? `<div class="field"><label for="match-id">Existing transaction</label><select name="transactionId" id="match-id" required>${sorted(
                    eligible,
                  )
                    .map(
                      (t) =>
                        `<option value="${t.id}">${esc(t.description)} · ${dateLabel(t.date)} · ${money(cents(t.amount))} · ${t.category}</option>`,
                    )
                    .join("")}</select></div>`
                : '<p class="muted small">There are no eligible unlinked entries for this payment.</p>'
            }`
          : `<p class="notice" style="margin-bottom:18px">This entry stays in the ignored list and will not affect reports. You can restore it later. To record a transfer between your accounts, choose Categorise → Transfer instead.</p>${field("Reason (optional)", "note", "text", "", 'maxlength="160"')}`
    }${errorBox}<div class="form-actions">${button("Later", "close")}<button class="btn primary" type="submit" ${tab === "match" && !eligible.length ? "disabled" : ""}>${tab === "categorize" ? "Save & next" : tab === "match" ? "Link & next" : "Ignore & next"} ${icon("arrow")}</button></div></form>`,
  );
}
function nextReview() {
  const next = state.inbox.find(
    (i) => i.status === "pending" && !dismissed.has(i.id),
  );
  if (next) reviewDialog(next.id);
  else closeModal();
}
function mappingDialog(csv) {
  const rows = parseCSV(csv);
  if (rows.length < 2)
    throw Error("Choose a CSV with a header and transaction rows.");
  const headers = rows[0],
    mapping = autoMapping(headers);
  modalContext = { kind: "mapping", csv };
  const names = {
    id: "Unique reference / UTR",
    date: "Transaction date",
    description: "Description",
    amount: "Amount",
    direction: "Debit / credit direction",
    debit: "Debit amount",
    credit: "Credit amount",
    method: "Payment method",
    account: "Account label",
  };
  showModal(
    "Map your statement columns",
    "Map the fields below. The next step previews entries without saving.",
    `<form data-form="import-preview"><div class="form-grid">${select("Amount columns", "amountMode", ["single", "split"], mapping.debit >= 0 || mapping.credit >= 0 ? "split" : "single")}${select("Date format", "dateFormat", ["ISO", "DMY"], "ISO")}</div><p class="fine muted" style="margin-top:12px">Single: amount + direction (DEBIT/CREDIT or DR/CR). Split: separate debit and credit columns. ISO: YYYY-MM-DD. DMY: DD/MM/YYYY.</p><div class="mapping-grid">${Object.entries(
      names,
    )
      .map(
        ([k, label]) =>
          `<div class="field"><label for="map-${k}">${label}</label><select name="map_${k}" id="map-${k}"><option value="-1">Not in this file</option>${headers.map((h, i) => `<option value="${i}" ${i === mapping[k] ? "selected" : ""}>${esc(h || "Column " + (i + 1))}</option>`).join("")}</select></div>`,
      )
      .join(
        "",
      )}</div><div class="form-grid">${field("Fallback account label", "defaultAccount", "text", "My bank", 'required maxlength="80"')}${select("Fallback payment method", "defaultMethod", methods, "Bank")}</div><p class="modal-note">Keep the account label consistent across imports. The same label + reference is counted once. Amounts must be positive; the direction determines money in or out.</p>${errorBox}${actions("Preview import")}</form>`,
    true,
  );
}
function importPreviewDialog(data, f) {
  modalContext = { kind: "import", fields: f, result: data };
  showModal(
    "Check before you import",
    "New entries will go to your review inbox, not straight into your totals.",
    `<div class="import-summary"><span class="pill mint">${data.newCount} new entries</span><span class="pill lav">${data.duplicates} duplicates skipped</span></div>${
      data.rows.length
        ? `<div class="table-wrap preview-table"><table><thead><tr><th>Date</th><th>Description</th><th>Direction</th><th>Amount</th><th>Reference</th></tr></thead><tbody>${data.rows
            .slice(0, 10)
            .map(
              (i) =>
                `<tr><td>${dateLabel(i.date)}</td><td>${esc(i.description)}</td><td>${esc(i.direction)}</td><td>${money(cents(i.amount))}</td><td>${esc(i.reference)}</td></tr>`,
            )
            .join(
              "",
            )}</tbody></table></div><p class="modal-note">Showing ${Math.min(10, data.newCount)} of ${data.newCount} new entries. Review every entry in your inbox after importing.</p>`
        : empty(
            "Everything is already here.",
            "No new transactions were found in this statement.",
          )
    }<form data-form="import-commit">${errorBox}<div class="form-actions">${button("Back to mapping", "map-back")}<button type="submit" class="btn primary" ${data.newCount ? "" : "disabled"}>Import ${data.newCount} entries</button></div></form>`,
    true,
  );
}
function legacyDialog() {
  guard();
  modalContext = { kind: "legacy" };
  showModal(
    "Import previous expenses",
    "Use the expenses.csv file from your original Java project.",
    `<form data-form="legacy"><div class="field"><label for="legacy-file">Old expenses.csv</label><input id="legacy-file" name="legacyFile" type="file" accept=".csv,text/csv" required><small>Headerless CSV: date, description, category, amount; an initial UUID is also supported.</small></div><div style="margin-top:18px">${field("Old monthly budget (optional, ₹)", "budget", "number", "", 'min="0.01" max="999999999.99" step="0.01"')}</div><p class="modal-note">Your old file stays unchanged. Historical payment methods were not recorded, so imported entries use “Other”. Re-importing the same file skips its existing records.</p>${errorBox}${actions("Import old expenses")}</form>`,
  );
}
function downloadCSV(filename, rows) {
  const safe = (v) => {
    let s = String(v ?? "");
    if (/^[\s]*[=+@-]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const csv =
      "\uFEFF" + rows.map((row) => row.map(safe).join(",")).join("\r\n"),
    url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportRows(rows) {
  guard();
  downloadCSV("expenses-" + month + ".csv", [
    [
      "date",
      "description",
      "category",
      "amount",
      "type",
      "method",
      "notes",
      "source",
    ],
    ...rows.map((t) => [
      t.date,
      t.description,
      t.category,
      t.amount,
      t.type,
      t.method,
      t.notes,
      t.source,
    ]),
  ]);
  toast("CSV exported.");
}
// Keep the drawer accessible to keyboard and touch users.
function setMenu(open) {
  const shell = root.querySelector(".shell"),
    sidebar = root.querySelector(".sidebar"),
    main = root.querySelector(".main"),
    trigger = root.querySelector(".mobile-menu");
  shell?.classList.toggle("nav-open", open);
  sidebar?.classList.toggle("open", open);
  trigger?.setAttribute("aria-expanded", String(open));
  if (main) main.inert = open;
  (open ? root.querySelector(".mobile-close") : trigger)?.focus();
}
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && root.querySelector(".nav-open")) setMenu(false);
});
async function perform(action, el) {
  if (action === "close") {
    closeModal();
    return;
  }
  if (action === "menu" || action === "menu-close") {
    setMenu(action === "menu");
    return;
  }
  if (action === "auth-switch") {
    authMode = authMode === "login" ? "register" : "login";
    renderAuth();
    return;
  }
  if (action === "login-choice") {
    authPortal = el.dataset.role;
    authMode = "login";
    renderAuth();
    root.querySelector("#field-email")?.focus();
    return;
  }
  if (action === "login-back") {
    authPortal = "";
    authMode = "login";
    renderAuth();
    root.querySelector(".login-choice")?.focus();
    return;
  }
  if (action === "logout") {
    await api("logout", "POST");
    state = null;
    directory = null;
    authPortal = "";
    authMode = "login";
    closeModal();
    publicInfo = await api("public");
    render();
    return;
  }
  if (action === "admin") {
    await openAdmin();
    return;
  }
  if (action === "own") {
    state = await api("state");
    page = "overview";
    render();
    return;
  }
  if (action === "view") {
    state = await api("admin/users/" + el.dataset.id + "/state");
    page = "overview";
    render();
    return;
  }
  if (action === "navigate") {
    await navigate(el.dataset.target);
    return;
  }
  if (action === "inbox-tab") {
    inboxTab = el.dataset.tab;
    render();
    return;
  }
  if (action === "export") {
    exportRows(filteredTransactions());
    return;
  }
  if (action === "export-month") {
    exportRows(sorted(monthly(state.transactions, month)));
    return;
  }
  if (action === "template") {
    downloadCSV("statement-template.csv", [
      [
        "transaction_id",
        "date",
        "description",
        "amount",
        "direction",
        "method",
        "account",
      ],
      [
        "REF-001",
        today(),
        "College canteen",
        "120.00",
        "DEBIT",
        "UPI",
        "My bank",
      ],
      [
        "REF-002",
        today(),
        "Monthly allowance",
        "15000.00",
        "CREDIT",
        "Bank",
        "My bank",
      ],
    ]);
    return;
  }
  guard();
  if (action === "add" || action === "cash" || action === "edit") {
    transactionDialog(el.dataset.id || "", action === "cash");
    return;
  }
  if (action === "budget") {
    budgetDialog(el.dataset.category || "Overall");
    return;
  }
  if (action === "legacy") {
    legacyDialog();
    return;
  }
  if (action === "delete") {
    const t = state.transactions.find((t) => t.id === el.dataset.id);
    modalContext = { kind: "delete", id: t.id };
    showModal(
      "Remove this transaction?",
      t.description,
      `<p class="notice">${money(cents(t.amount))} · ${dateLabel(t.date)}. ${t.inboxId ? "The linked import will move to Ignored, where it can be restored." : "This manual entry will be permanently removed from the ledger."}</p><form data-form="delete">${errorBox}${actions("Remove transaction")}</form>`,
    );
    return;
  }
  if (action === "review") {
    reviewDialog(el.dataset.id);
    return;
  }
  if (action === "review-tab") {
    reviewDialog(modalContext.id, el.dataset.tab);
    return;
  }
  if (action === "review-category") {
    modal.querySelector("input[name=category]").value = el.dataset.category;
    modal.querySelectorAll("[data-action=review-category]").forEach((b) => {
      const selected = b === el;
      b.classList.toggle("active", selected);
      b.setAttribute("aria-pressed", String(selected));
    });
    return;
  }
  if (action === "restore") {
    state = await api("inbox/" + el.dataset.id, "PUT", { action: "restore" });
    render();
    reviewDialog(el.dataset.id);
    return;
  }
  if (action === "map-back") {
    mappingDialog(modalContext.fields.csv);
    return;
  }
}
async function submit(form) {
  const kind = form.dataset.form,
    f = formData(form);
  if (kind === "auth") {
    const setup = publicInfo.setupRequired && !!setupKey;
    await enterWorkspace(
      await api(
        setup ? "setup" : authMode === "register" ? "register" : "login",
        "POST",
        {
          ...f,
          loginRole: authPortal === "admin" ? "ADMIN" : "USER",
          ...(setup ? { setupKey } : {}),
        },
      ),
    );
    return;
  }
  guard();
  if (kind === "transaction") {
    const { id, t } = modalContext;
    if (t?.inboxId) for (const k of ["amount", "date", "method"]) f[k] = t[k];
    state = await api(
      "transactions" + (id ? "/" + id : ""),
      id ? "PUT" : "POST",
      f,
    );
    closeModal();
    render();
    toast(id ? "Transaction updated." : "Transaction added.");
  } else if (kind === "delete") {
    state = await api("transactions/" + modalContext.id, "DELETE");
    closeModal();
    render();
    toast("Transaction removed.");
  } else if (kind === "budget") {
    state = await api("budgets", "PUT", f);
    month = f.month;
    closeModal();
    render();
    toast("Budget saved.");
  } else if (kind === "profile") {
    state = await api("profile", "PUT", f);
    render();
    toast("Preferences saved.");
  } else if (kind === "password") {
    if (f.newPassword !== f.confirmPassword)
      throw Error("The new passwords do not match.");
    state = await api("password", "PUT", f);
    render();
    toast("Password changed. Other sessions have been signed out.");
  } else if (kind === "adapter") {
    state = await api("adapter-consent", "PUT", f);
    render();
    toast("Import permission saved.");
  } else if (kind === "review") {
    const { id, tab } = modalContext;
    state = await api("inbox/" + id, "PUT", { ...f, action: tab });
    dismissed.add(id);
    render();
    toast(
      tab === "match"
        ? "Linked to the existing transaction."
        : tab === "ignore"
          ? "Entry ignored."
          : "Transaction categorised.",
    );
    nextReview();
  } else if (kind === "import-preview") {
    const fields = { ...f, csv: modalContext.csv };
    const result = await api("import/preview", "POST", fields);
    importPreviewDialog(result, fields);
  } else if (kind === "import-commit") {
    const result = await api("import/commit", "POST", modalContext.fields);
    state = result.state;
    closeModal();
    page = "inbox";
    inboxTab = "pending";
    render();
    toast(
      `${result.imported} entries imported; ${result.duplicates} duplicates skipped.`,
    );
    nextReview();
  } else if (kind === "legacy") {
    const file = form.querySelector("[type=file]").files[0];
    if (!file || file.size > 2000000)
      throw Error("Choose an old CSV file under 2 MB.");
    const result = await api("import/legacy", "POST", {
      csv: await file.text(),
      ...(f.budget ? { budget: f.budget } : {}),
    });
    state = result.state;
    closeModal();
    render();
    toast(result.imported + " old expenses imported.");
  }
}
document.addEventListener("click", async (event) => {
  const el = event.target.closest("[data-action],[data-page]");
  if (!el || el.disabled || busy) return;
  event.preventDefault();
  busy = true;
  try {
    if (el.dataset.page) await navigate(el.dataset.page);
    else await perform(el.dataset.action, el);
  } catch (e) {
    toast(e.message, true);
  } finally {
    busy = false;
  }
});
document.addEventListener("submit", async (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  if (busy) return;
  busy = true;
  const submitButton = event.submitter,
    err = form.querySelector("[data-error]");
  if (err) err.textContent = "";
  if (submitButton) submitButton.disabled = true;
  try {
    await submit(form);
  } catch (e) {
    if (err && err.isConnected) err.textContent = e.message;
    else toast(e.message, true);
  } finally {
    busy = false;
    if (submitButton?.isConnected) submitButton.disabled = false;
  }
});
document.addEventListener("change", async (event) => {
  const el = event.target;
  if (el.id === "report-month" && /^\d{4}-\d{2}$/.test(el.value)) {
    month = el.value;
    render();
  } else if (el.dataset.filter) {
    filters[el.dataset.filter] = el.type === "checkbox" ? el.checked : el.value;
    render();
  } else if (el.id === "statement-file") {
    try {
      guard();
      const file = el.files[0];
      if (!file) return;
      if (file.size > 2000000)
        throw Error("Choose a CSV file smaller than 2 MB.");
      mappingDialog(await file.text());
    } catch (e) {
      toast(e.message, true);
    } finally {
      el.value = "";
    }
  }
});
document.addEventListener("input", (event) => {
  const el = event.target;
  if (el.id === "transaction-search") {
    filters.search = el.value;
    const rows = filteredTransactions();
    document.querySelector("#ledger-results").innerHTML = ledgerTable(rows);
    document.querySelector("#ledger-count").textContent =
      rows.length + " transaction" + (rows.length === 1 ? "" : "s");
  }
});
modal.addEventListener("cancel", (event) => {
  event.preventDefault();
  if (!busy) closeModal();
});
async function refresh() {
  if (
    !state ||
    document.hidden ||
    busy ||
    refreshing ||
    modal.open ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName)
  )
    return;
  refreshing = true;
  try {
    const ro = readonly(),
      next = await api(
        ro ? "admin/users/" + state.profile.id + "/state" : "state",
      );
    const oldIds = new Set(state.inbox.map((i) => i.id)),
      fresh = next.inbox.find(
        (i) => i.status === "pending" && !oldIds.has(i.id),
      );
    const changed = JSON.stringify(next) !== JSON.stringify(state);
    state = next;
    if (page === "admin") directory = await api("admin/users");
    if (changed || page === "admin") render();
    document.querySelector("#connection-error")?.setAttribute("hidden", "");
    if (fresh && !ro && page !== "admin" && !dismissed.has(fresh.id))
      reviewDialog(fresh.id);
  } catch (e) {
    if (e.status === 401) {
      state = null;
      closeModal();
      render();
      toast("Your session ended. Sign in again.", true);
    } else if (e.status === 403 && readonly()) {
      await openAdmin();
      toast("Access to that tracker has been revoked.", true);
    } else {
      const el = document.querySelector("#connection-error");
      if (el) {
        el.hidden = false;
        el.textContent =
          "Could not refresh. Check that the Java server is still running.";
      }
    }
  } finally {
    refreshing = false;
  }
}
async function init() {
  try {
    publicInfo = await api("public");
    try {
      await enterWorkspace(await api("state"));
    } catch (e) {
      if (e.status !== 401) throw e;
      renderAuth();
    }
  } catch (e) {
    root.innerHTML = `<div class="loading"><h1>Unable to open your tracker</h1><p>${esc(e.message)}</p><p>Check the Java window, then reload this page.</p></div>`;
  }
  setInterval(refresh, 5000);
}
// Progressive WebMCP support. Reading is scoped to the workspace currently visible.
if (navigator.modelContext?.registerTool) {
  try {
    navigator.modelContext.registerTool({
      name: "expense_tracker_summary",
      description:
        "Read monthly totals for the currently visible, authorised tracker. Does not save changes.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => {
        if (!state) throw Error("Sign in first.");
        const fresh = await api(
            readonly() ? "admin/users/" + state.profile.id + "/state" : "state",
          ),
          s = summary(fresh, month);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                name: fresh.profile.name,
                month,
                expenseINR: decimal(s.spent),
                incomeINR: decimal(s.income),
                pending: s.pending,
                readOnly: fresh.viewer.readOnly,
              }),
            },
          ],
        };
      },
    });
    navigator.modelContext.registerTool({
      name: "open_expense_form",
      description:
        "Open the expense form for the signed-in user to review and submit. Does not create a transaction.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      execute: async () => {
        if (!state) throw Error("Sign in first.");
        guard();
        transactionDialog();
        return {
          content: [
            {
              type: "text",
              text: "Expense form opened. The user must complete and submit it.",
            },
          ],
        };
      },
    });
  } catch {}
}
init();
