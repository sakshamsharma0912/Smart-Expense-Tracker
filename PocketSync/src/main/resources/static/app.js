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

import { formatMoney, budgetProgress, filterRows, dateRange, csvText, accentThemes } from "./presentation.js";
import { subscriptionCategories, frequencies, nextBilling, recurringSummary, filterRecurring, scheduleStatus, billingEvents, historyMonths, availableYears } from "./pocket.js";
let accessToken = "", refreshFlight = null;
let displayCurrency = "INR", accent = "sapphire";
const preferenceKey = () => "expense-v5:appearance:" + (state?.viewer.id || "anonymous");
function loadAppearance() {
  try {
    const preference = JSON.parse(localStorage.getItem(preferenceKey()) || "{}");
    displayCurrency = ["INR","USD","EUR"].includes(preference.currency) ? preference.currency : "INR";
    accent = accentThemes[preference.accent] ? preference.accent : "sapphire";
  } catch { displayCurrency = "INR"; accent = "sapphire"; }
  document.documentElement.style.setProperty("--mint", accentThemes[accent].color);
  document.documentElement.style.setProperty("--accent-ink", accent === "sapphire" ? "#ffffff" : "#111827");
}
function saveAppearance() {
  try { localStorage.setItem(preferenceKey(), JSON.stringify({currency: displayCurrency, accent})); } catch {}
  document.documentElement.style.setProperty("--mint", accentThemes[accent].color);
  document.documentElement.style.setProperty("--accent-ink", accent === "sapphire" ? "#ffffff" : "#111827");
}
function currencySelector(id = "display-currency") {
  return '<label class="currency-control" for="' + id + '"><span>Format</span><select id="' + id + '" aria-label="Currency display format">' +
    ["INR","USD","EUR"].map(code => '<option value="' + code + '" ' + (displayCurrency === code ? 'selected' : '') + '>' + code + ' ' + ({INR:"₹",USD:"$",EUR:"€"})[code] + '</option>').join('') + '</select></label>';
}
function ringMarkup(sm) {
  const progress = budgetProgress(sm.spent, sm.budget);
  return '<div class="budget-ring" style="--p:' + progress.fill + '%;--ring-color:' + progress.color + '" role="img" aria-label="' +
    (progress.set ? Math.round(progress.percentage) + '% of monthly budget used' : 'No monthly budget set') + '"><div><strong>' +
    (progress.set ? Math.round(progress.percentage) + '%' : '—') + '</strong><small>' + (progress.set ? 'OF BUDGET USED' : 'NO LIMIT SET') + '</small></div></div>';
}
async function refreshAccess() {
  if (!refreshFlight) refreshFlight = (async () => {
    const response = await fetch("/api/refresh", { method: "POST", credentials: "same-origin", headers: {"X-Requested-With":"ExpenseTracker"} });
    if (!response.ok) { const error = Error("Please sign in again."); error.status = 401; throw error; }
    const data = await response.json(); accessToken = data.accessToken;
  })().finally(() => { refreshFlight = null; });
  return refreshFlight;
}
async function authorizedFetch(path, options = {}, retry = true) {
  const headers = new Headers(options.headers || {});
  if (accessToken && !["public","login","register","refresh"].includes(path)) headers.set("Authorization", "Bearer " + accessToken);
  const response = await fetch("/api/" + path, {...options, headers, credentials:"same-origin"});
  if (response.status === 401 && retry && !["public","login","register","refresh"].includes(path)) {
    await refreshAccess(); return authorizedFetch(path, options, false);
  }
  return response;
}
async function downloadReport(format) {
  guard();
  const response = await authorizedFetch("reports/monthly?month=" + encodeURIComponent(month) + "&format=" + format);
  if (!response.ok) { const error = await response.json(); throw Error(error.error || "Report failed."); }
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a"); link.href=url; link.download="pocketsync-monthly-" + month + "." + format; link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
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
let subscriptionFilters = {search:"", category:"", status:"", order:"due"};
let filters = { search: "", category: "", type: "", method: "", range: "selected", start: "", end: "" },
  inboxTab = "pending",
  modalContext = {},
  busy = false,
  refreshing = false;
const dismissed = new Set();
const labels = {
  overview: "Dashboard",
  profile: "My profile",
  subscriptions: "Subscriptions",
  calendar: "Billing calendar",
  transactions: "Transactions",
  inbox: "Review inbox",
  budgets: "Budgets",
  reports: "Reports",
  imports: "Bank imports",
  settings: "Settings",
  admin: "Admin dashboard",
};
const paths = {
  music:"M9 18V5l12-2v13 M9 18a3 3 0 1 1-3-3c2 0 3 1 3 3 M21 16a3 3 0 1 1-3-3c2 0 3 1 3 3",
  code:"M8 5 2 12l6 7 M16 5l6 7-6 7 M14 3l-4 18",
  cloud:"M6 18h13a4 4 0 0 0 0-8h-1a6 6 0 0 0-12 0 4 4 0 0 0 0 8z",
  calendar:"M4 5h16v16H4z M8 3v4 M16 3v4 M4 10h16 M8 14h2 M14 14h2 M8 18h2",
  user:"M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M4 21v-2a8 8 0 0 1 16 0v2",
  bell:"M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9 M10 21h4",
  pause:"M8 5v14 M16 5v14",
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
const money = (n) => formatMoney(n, displayCurrency);
const compact = (n) => formatMoney(n, displayCurrency, true);
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
  `<div class="brand"><span class="brand-mark">${icon("wallet")}</span><div>PocketSync<span><small>Spend smart. Stay in sync.</small></span></div></div>`;
const stat = (label, value, note, ico = "wallet", color = "") =>
  `<button type="button" class="card stat interactive-stat" data-action="stat-explore" data-label="${esc(label)}" aria-label="Explore ${esc(label.toLowerCase())}"><div class="stat-top">${label}${icon(ico)}</div><div class="stat-value ${color}">${value}</div><p>${note}</p></button>`;
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
  const r = await authorizedFetch(path, {
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
  if (data.accessToken) { accessToken = data.accessToken; delete data.accessToken; delete data.expiresIn; }
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
  root.innerHTML = `<div class="auth"><section class="auth-story">${brand()}<div><div class="eyebrow">YOUR MONEY. A CLEARER PICTURE.</div><h1>Know where<br>your money<br><span>goes.</span></h1><p class="intro">A simple record of what comes in, what goes out, and what you have planned. Cash and digital payments, in one place.</p><div class="auth-features"><div><span>01</span><p>Record the everyday.<small>Cash, UPI, card and bank payments.</small></p></div><div><span>02</span><p>Make room for your plans.<small>Monthly limits and category budgets.</small></p></div><div><span>03</span><p>See the whole picture.<small>Spending patterns, month by month.</small></p></div></div></div><footer>Expenses · Budgets · Reports / INR ₹</footer></section><section class="auth-main" id="main-content" tabindex="-1"><div class="auth-box"><div class="auth-mobile-brand">${brand()}</div><div class="eyebrow">${setup ? "FIRST-TIME SETUP" : admin ? "ADMINISTRATION" : chosen ? "PERSONAL WORKSPACE" : "POCKETSYNC"}</div><h2>${title}</h2><p>${setup ? "Create the administrator account for this installation." : register ? "A private space for your expenses and budgets." : chosen ? (admin ? "Sign in to manage accounts and view shared trackers." : "Sign in to pick up where you left off.") : "Sign in to your personal tracker or open the admin dashboard."}</p>${body}</div></section></div>`;
}
function heading(title, subtitle, extra = "", showMonth = true) {
  return `<div class="page-heading"><div><h1 tabindex="-1"><span class="text-hover">${esc(title)}</span></h1><p>${esc(subtitle)}</p></div><div class="heading-actions">${showMonth ? `<input aria-label="Reporting month" class="month-input" type="month" id="report-month" value="${esc(month)}" min="1900-01" max="2100-12">` : ""}${extra}</div></div>`;
}
function render() {
  if (!state) {
    renderAuth();
    return;
  }
  history.replaceState(null,"",location.pathname+"#page="+page+"&month="+month);
  const a = state.profile,
    sm = summary(state, month),
    admin = state.viewer.role === "ADMIN";
  const nav = [
    ["overview", "grid"],
    ["subscriptions", "card"],
    ["calendar", "calendar"],
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
  root.innerHTML = `<div class="shell"><aside class="sidebar" id="workspace-navigation">${brand()}<button type="button" class="icon-btn mobile-close" data-action="menu-close" aria-label="Close navigation">${icon("close")}</button><div class="nav-label">WORKSPACE</div><nav class="navigation" aria-label="Main navigation">${admin ? `<button type="button" class="nav-item ${page === "admin" ? "active" : ""}" data-action="admin">${icon("users")}<span class="nav-text">Admin dashboard</span></button>` : ""}${nav.map(([p, i]) => `<button type="button" class="nav-item ${page === p ? "active" : ""}" data-page="${p}" ${page === p ? 'aria-current="page"' : ""}>${icon(i)}<span class="nav-text">${labels[p]}</span>${p === "inbox" && sm.pending ? `<span class="badge-count">${sm.pending}</span>` : ""}</button>`).join("")}</nav><div class="side-bottom">${sm.budget && page !== "admin" ? `<button type="button" class="mini-budget" data-page="budgets" aria-label="Open selected month budget"><span class="row between"><span>Monthly budget</span>${icon("target")}</span><strong>${money(Math.max(0, sm.left))}</strong><p>${sm.left >= 0 ? "left to spend" : money(-sm.left) + " over budget"}</p><div class="track"><span style="width:${Math.min(100, (sm.spent / sm.budget) * 100)}%"></span></div></button>` : ""}${!readonly() ? `<button type="button" class="nav-item ${page === "settings" ? "active" : ""}" data-page="settings">${icon("settings")}<span class="nav-text">Settings</span></button>` : ""}<button type="button" class="nav-item" data-action="logout">${icon("logout")}<span class="nav-text">Sign out</span></button><button type="button" class="account profile-link" data-page="profile" aria-label="Open my profile"><span class="avatar">${esc(initials(state.viewer.name))}</span><span><strong>${esc(state.viewer.name)}</strong><small>${admin ? "Admin account" : "Personal account"}</small></span>${icon("chevron")}</button></div></aside><button type="button" class="nav-scrim" data-action="menu-close" aria-label="Close navigation backdrop" tabindex="-1"></button><main class="main" id="main-content" tabindex="-1"><header class="topbar"><div class="row"><button type="button" class="icon-btn mobile-menu" data-action="menu" aria-label="Open navigation" aria-controls="workspace-navigation" aria-expanded="false">${icon("menu")}</button><div class="breadcrumb">${esc(personal)}<span>/ ${labels[page]}</span></div></div><div class="topbar-right"><button type="button" class="top-search" data-action="global-search" aria-label="Search transactions">${icon("search")}<span>Search transactions</span><kbd>Ctrl K</kbd></button>${currencySelector()}<span class="pill mint">${admin ? "Admin" : "Personal"} workspace</span><button type="button" class="icon-btn" data-page="settings" aria-label="Open settings">${icon("settings")}</button><button type="button" class="icon-btn notification-button" data-action="due-subscriptions" aria-label="Open due subscriptions">${icon("bell")}${(state.recurring||[]).some(r=>scheduleStatus(r,today())==="due") ? '<span class="notification-dot"></span>' : ""}</button><button type="button" class="top-profile" data-page="profile" aria-label="Open my profile"><span class="avatar">${esc(initials(state.viewer.name))}</span><span>${esc(state.viewer.name)}</span></button></div></header><div class="content">${readonly() ? `<div class="view-banner">${icon("lock")}<span>Viewing <strong>${esc(a.name)}’s tracker</strong> with permission. This view is read-only and logged.</span>${button("Back to admin", "admin", "sm")}</div>` : ""}<div id="connection-error" class="connection-error" hidden></div>${pageContent()}<footer class="footer"><span>PocketSync</span><span>${readonly() ? "Read-only shared view" : "Saved to your account"} · Base currency: INR${displayCurrency !== "INR" ? " · " + displayCurrency + " formatting only; no FX conversion" : ""}</span></footer></div></main></div>`;
}
function pageContent() {
  return (
    {
      overview: overview,
      profile: profilePage,
      subscriptions: subscriptionsPage,
      calendar: calendarPage,
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
  return `<svg viewBox="0 0 280 94" role="img" aria-label="Cumulative spending through ${esc(monthName(month))}"><path d="M0 84H280 M0 46H280 M0 8H280" stroke="var(--muted)" stroke-opacity=".3" stroke-dasharray="3 5"/><polygon points="0,94 ${pts} 280,94" fill="var(--mint)" opacity=".09"/><polyline points="${pts}" fill="none" stroke="var(--mint)" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
}
function barChart() {
  const values=historyMonths(state,month.slice(0,4)), max=Math.max(100,...values.flatMap(v=>[v.spent,v.budget]));
  return `<div class="history-chart" role="group" aria-label="Monthly spending and saved budgets. Select a month to open its budget.">${values.map(v=>{
    const label=monthName(v.month), h=v.spent ? Math.max(4, v.spent/max*152) : 2;
    return `<button type="button" class="history-month ${v.month===month?'selected':''}" data-action="history-month" data-month="${v.month}" aria-pressed="${v.month===month}" aria-label="Open ${label} budget: ${v.hasBudget?money(v.budget):'not set'}; expenses ${money(v.spent)}" title="${label}: ${money(v.spent)} spent · ${v.hasBudget?money(v.budget)+' budget':'no saved budget'}"><span class="history-bar-track"><span class="history-bar" style="height:${h}px"><span></span><span></span><span></span></span>${v.hasBudget?`<span class="history-budget-marker" style="bottom:${Math.min(152,v.budget/max*152)}px"></span>`:''}</span><span class="history-label">${new Date(v.month+'-01T12:00:00Z').toLocaleDateString('en-IN',{month:'short',timeZone:'UTC'})}</span></button>`;
  }).join('')}</div><div class="history-key"><span><i class="legend-dot"></i>Recorded expenses</span><span><i class="budget-marker-key"></i>Saved budget</span><span>Tap a month to view its budget</span></div>`;
}
function donut(rows) {
  const values = breakdown(rows),
    sum = total(rows),
    r = 65,
    circ = 2 * Math.PI * r;
  let offset = 0;
  return `<div class="donut-area"><div class="donut-wrap"><svg viewBox="0 0 168 168" aria-hidden="true"><circle cx="84" cy="84" r="${r}" fill="none" stroke="var(--line)" stroke-width="17"/>${values
    .map((v) => {
      const size = (v.value / (sum || 1)) * circ,
        out = `<circle cx="84" cy="84" r="${r}" fill="none" stroke="${v.color}" stroke-width="17" stroke-dasharray="${Math.max(0, size - 3)} ${circ}" stroke-dashoffset="${-offset}"/>`;
      offset += size;
      return out;
    })
    .join(
      "",
    )}</svg><div class="donut-center"><small>TOTAL SPENT</small><strong>${compact(sum)}</strong><small>${values.length} categories</small></div></div><div class="category-legend">${values.length ? values.map((v) => `<button type="button" class="legend-row" data-action="category-ledger" data-category="${v.name}" aria-label="View ${v.name} transactions"><span class="legend-dot" style="background:${v.color}"></span><span>${v.name}</span><strong>${money(v.value)}</strong></button>`).join("") : '<p class="muted small">Your category breakdown will appear here.</p>'}</div></div>`;
}
function overview() {
  const sm=summary(state,month), rs=recurringSummary(state.recurring||[],state.transactions,month,today());
  return `${heading("Dashboard","Your spending, subscriptions and savings, in sync.", !readonly()?button(icon("plus")+" Add transaction","add","primary"):"")}
  <div class="hero-grid"><section class="card spend-hero"><div><div class="eyebrow">TOTAL SPENDING · ${esc(monthName(month).toUpperCase())}</div><div class="hero-amount">${money(sm.spent)}</div><div class="hero-note">${sm.budget?`${money(Math.abs(sm.left))} ${sm.left>=0?'remaining in your monthly plan':'over your monthly plan'}`:'Set a monthly budget to plan ahead.'}</div><button type="button" class="pill mint" data-action="month-ledger">${sm.expenses.length} recorded expenses ${icon("arrow")}</button></div><button type="button" class="hero-chart chart-trigger" data-action="month-ledger" aria-label="View this month’s expense ledger">${cumulativeChart(sm)}<span class="fine muted">Cumulative spending · view ledger</span></button></section>
  <section class="card subscription-hero"><div class="row between"><span class="eyebrow">RECURRING SPENDING</span>${icon("refresh")}</div><div class="recurring-hero-amount">${money(rs.monthly)}<small>/ month</small></div><p class="small muted">Monthly equivalent of active expense schedules</p><div class="subscription-hero-stats"><button type="button" data-page="subscriptions"><strong>${rs.active}</strong><span>Active schedules</span></button><button type="button" data-action="due-subscriptions"><strong>${rs.due}</strong><span>Due to record</span></button></div><div class="row">${button("Manage subscriptions "+icon("arrow"),"navigate","primary sm",'data-target="subscriptions"')}${button(icon("calendar"),"navigate","sm",'data-target="calendar" aria-label="Open billing calendar"')}</div></section></div>
  <div class="stats">${stat("Money in",money(sm.income),"Recorded income this month","down","mint")}${stat("Budget remaining",sm.budget?money(sm.left):"Not set",sm.budget?"View this month’s budget":"Set a limit in Budgets","target",sm.left<0?"red":"")}${stat("Paid with UPI",money(sm.upi),"View UPI expenses","upi")}${stat("Paid with cash",money(sm.cash),"View cash expenses","cash")}</div>
  ${rs.due?`<button type="button" class="due-banner" data-action="due-subscriptions">${icon("bell")}<span><strong>${rs.due} recurring schedule${rs.due===1?'':'s'} due.</strong> Review billing entries before recording them.</span><span>Review ${icon("arrow")}</span></button>`:''}
  <div class="charts-grid"><section class="card history-card"><div class="card-head"><div><h2>Annual spending history</h2><p>Compare your expenses with saved monthly budgets</p></div><select id="history-year" aria-label="Spending history year">${options(availableYears(state,today()),month.slice(0,4))}</select></div>${barChart()}</section><section class="card category-card"><div class="card-head"><div><h2>Spending by category</h2><p>${monthName(month)} · select a category to explore</p></div></div>${donut(sm.expenses)}</section></div>
  <div class="dashboard-bottom"><section class="card"><div class="card-head"><div><h2>Subscriptions & recurring entries</h2><p>Your next billing dates, at a glance</p></div>${!readonly()?button(icon("plus")+" Add subscription","recurring-add","soft sm"):''}</div>${subscriptionTable(filterRecurring(state.recurring||[],{order:'due'},today()).slice(0,4))}<button type="button" class="text-btn" data-page="subscriptions">View all schedules ${icon("arrow")}</button></section>
  <section class="card budget-preview"><div class="row between"><span class="eyebrow">${esc(monthName(month).toUpperCase())}</span>${icon("target")}</div><h2>Your monthly plan</h2>${ringMarkup(sm)}<p>${sm.budget?money(sm.spent)+' of '+money(sm.budget)+' used':'No overall budget saved for this month.'}</p>${button("View budget "+icon("arrow"),"navigate","soft",'data-target="budgets"')}</section></div>
  <section class="card"><div class="card-head"><div><h2>Recent transactions</h2><p>Select an entry to view its details</p></div><button type="button" class="text-btn" data-page="transactions">View all ${icon("arrow")}</button></div>${ledgerTable(sorted(sm.rows).slice(0,5),false)}</section>`;
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
      return `<tr><td><div class="description-cell"><span class="category-icon" style="--c:${c.color}">${icon(c.icon)}</span><div><button type="button" class="transaction-name" data-action="transaction-view" data-id="${esc(t.id)}" title="${esc(t.description)}">${esc(t.description)}</button><small>${cap(t.type)}${t.source === "recurring" ? " · recurring" : t.inboxId ? " · linked import" : ""}</small></div></div></td><td>${dateLabel(t.date)}</td><td><span class="category-pill" style="--c:${c.color}">${c.name}</span></td><td>${esc(t.method)}</td><td class="amount-cell ${credit ? "credit" : ""}">${credit ? "+" : t.type === "expense" ? "−" : ""}${money(cents(t.amount))}</td>${controls && !readonly() ? `<td><div class="row-actions"><button type="button" class="icon-btn" data-action="edit" data-id="${esc(t.id)}" aria-label="Edit ${esc(t.description)}">${icon("edit")}</button><button type="button" class="icon-btn" data-action="delete" data-id="${esc(t.id)}" aria-label="Delete ${esc(t.description)}">${icon("trash")}</button></div></td>` : ""}</tr>`;
    })
    .join("")}</tbody></table></div>`;
}
function filteredTransactions() {
  return sorted(filterRows(state.transactions, filters, month, today()));
}
function datePills() {
  const pills = [["selected",monthName(month)],["all","All"],["month","This Month"],["last30","Last 30 Days"],["custom","Custom"]];
  return '<div class="date-pills" role="group" aria-label="Transaction date range">' + pills.map(([value,label]) =>
    '<button type="button" class="date-pill ' + (filters.range === value ? 'active' : '') + '" data-action="date-range" data-range="' + value + '" aria-pressed="' + (filters.range === value) + '">' + label + '</button>').join('') + '</div>' +
    (filters.range === 'custom' ? '<div class="custom-range"><label>From<input type="date" data-filter="start" value="' + filters.start + '"></label><label>To<input type="date" data-filter="end" value="' + filters.end + '"></label><p>' + (filters.start > filters.end && filters.end ? 'Start date must be before end date.' : 'Both dates are inclusive.') + '</p></div>' : '');
}
function transactionsPage() {
  const rows = filteredTransactions();
  return `${heading("Transactions", "Cash, digital payments and money coming in, together.", !readonly() ? button(icon("plus") + " Add transaction", "add", "primary") : "")}<div class="toolbar"><div class="search">${icon("search")}<input id="transaction-search" type="search" placeholder="Search description or notes" aria-label="Search transactions" value="${esc(filters.search)}"></div><div class="filters"><select aria-label="Filter category" data-filter="category"><option value="">All categories</option>${options(
    categories.map((c) => c.name),
    filters.category,
  )}</select><select aria-label="Filter type" data-filter="type"><option value="">All types</option>${options(types, filters.type)}</select><select aria-label="Filter payment method" data-filter="method"><option value="">All payments</option>${options(methods, filters.method)}</select>${!readonly() ? button(icon("down") + " Export CSV", "export", "sm") : ""}</div></div>${datePills()}<section class="card"><div class="card-head"><div><h2 id="ledger-count">${rows.length} transaction${rows.length === 1 ? "" : "s"}</h2><p>${filters.range === "all" ? "All recorded dates" : filters.range === "last30" ? "Last 30 days, through today" : filters.range === "custom" ? "Custom date range" : filters.range === "month" ? monthName(today().slice(0,7)) : monthName(month)}</p></div></div><div id="ledger-results">${ledgerTable(rows)}</div><div class="table-foot">Base amounts are INR. ${displayCurrency !== "INR" ? displayCurrency + " changes formatting only, without exchange-rate conversion. " : ""}Transfers are kept separate from income and spending.</div></section>`;
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
  return `${heading("Budgets", "View saved monthly plans and set category limits.", !readonly() ? button(icon("plus") + " Set budget", "budget", "primary") : "")}<div class="budget-layout"><section class="card budget-main"><div class="eyebrow">OVERALL MONTHLY BUDGET</div><div class="budget-big">${sm.budget ? money(sm.budget) : "Not set"}</div><p class="small muted">${monthName(month)}</p>${ringMarkup(sm)}<div class="row between"><span class="muted small">Spent so far</span><strong>${money(sm.spent)}</strong></div><div class="divider"></div><div class="row between"><span class="muted small">${sm.left >= 0 ? "Remaining" : "Over budget"}</span><strong>${sm.budget ? money(Math.abs(sm.left)) : "—"}</strong></div>${!readonly() ? `<div class="stack budget-actions">${button(sm.budget?"Edit monthly budget":"Set monthly budget", "budget", "soft", 'data-category="Overall"')}${sm.budget?button("Remove monthly limit","budget-remove","danger sm",`data-id="${state.budgets.find(b=>b.month===month&&b.category==="Overall").id}"`):""}</div>` : ""}</section><section class="card"><div class="card-head"><div><h2>Category budgets</h2><p>Category limits for ${monthName(month)}</p></div></div>${categories
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
    )}<p class="fine muted" style="margin-top:20px">Category limits guide individual areas. They do not automatically change your overall budget.</p></section></div>${budgetHistory()}`;
}
function reportsPage() {
  const sm = summary(state, month),
    b = breakdown(sm.expenses),
    previous = summary(state, monthShift(month, -1)),
    diff = sm.spent - previous.spent;
  return `${heading("Reports", "Patterns from your recorded income and expenses.", !readonly() ? button(icon("down") + " CSV", "export-month", "soft") + button("Excel", "report-xlsx", "soft") + button("PDF", "report-pdf", "soft") : "")}<div class="stats">${stat("Total expenses", money(sm.spent), sm.expenses.length + " recorded expenses", "up")}${stat("Recorded income", money(sm.income), "Excludes refunds and transfers", "down", "mint")}${stat("Refunds received", money(sm.refunds), "Shown separately from income", "refresh")}${stat("Recorded net", money(sm.income + sm.refunds - sm.spent), "Income + refunds − expenses", "wallet")}</div><div class="report-grid"><section class="card"><div class="card-head"><div><h2>How you paid</h2><p>Expense amounts by payment method</p></div></div>${methods
    .map((m, i) => {
      let n = total(sm.expenses.filter((t) => t.method === m));
      return `<div class="payment-row"><div class="row between"><button type="button" class="row method-explore" data-action="method-ledger" data-method="${m}">${icon({ Cash: "cash", UPI: "upi", Card: "card", Bank: "bank" }[m] || "wallet")}${m}</button><strong>${money(n)}</strong></div><div class="track"><span style="background:${categories[i].color};width:${sm.spent ? (n / sm.spent) * 100 : 0}%"></span></div></div>`;
    })
    .join(
      "",
    )}</section><section class="card"><div class="card-head"><div><h2>Your category mix</h2><p>${monthName(month)}</p></div></div>${donut(sm.expenses)}<div class="divider"></div><p class="small muted">${b.length ? `${b[0].name} was your largest category at ${Math.round((b[0].value / sm.spent) * 100)}% of recorded spending.` : "Add expenses to see your category mix."}</p></section><section class="card"><div class="card-head"><div><h2>Compared with last month</h2><p>Recorded expenses, full calendar months</p></div></div><div class="insight-number">${diff >= 0 ? "+" : "−"}${money(Math.abs(diff))}</div><p class="small muted" style="margin-top:12px">${previous.spent ? Math.round((Math.abs(diff) / previous.spent) * 100) + "% " + (diff >= 0 ? "more" : "less") + " than " + monthName(monthShift(month, -1)) : "No spending was recorded in the previous month."}</p><p class="fine muted" style="margin-top:20px">The current month may be incomplete. This is a comparison of recorded entries, not a forecast.</p></section><section class="card"><div class="card-head"><div><h2>What these numbers include</h2><p>Clear inputs, clearer reports</p></div></div><div class="info-copy"><p>Only categorised ledger entries count. Your ${sm.pending} pending import${sm.pending === 1 ? "" : "s"} ${sm.pending === 1 ? "is" : "are"} waiting for review.</p><p>Transfers do not count as income or expenses. Refunds appear separately. “Recorded net” is not your bank balance.</p></div></section></div>`;
}
function importsPage() {
  return `${heading("Bank imports", "Import a statement, then decide where each payment belongs.", "", false)}<div class="import-grid"><section class="card"><div class="card-head"><div><h2>Smart statement import</h2><p>Automatic categorization into your ledger</p></div><span class="pill mint">NEW</span></div><form data-form="smart-import">${field("Account label", "defaultAccount", "text", "My bank", 'required maxlength="80"')}${select("Default payment", "defaultMethod", methods, "Bank")}<div class="field"><label for="smart-file">Bank / UPI CSV</label><input id="smart-file" name="file" type="file" accept=".csv,text/csv" required></div><p class="fine muted">Supports amount + direction or separate debit/credit columns. Known merchants get suggested categories; edit them after import. Unique references prevent duplicates. Optional tax_amount values are recorded as entered.</p>${errorBox}<button type="submit" class="btn primary">Import & categorize</button></form></section><section class="card"><div class="card-head"><div><h2>Import a bank statement</h2><p>A working way to bring in your UPI history</p></div><span class="pill mint">CSV</span></div><div class="upload-zone">${icon("up")}<h3>Choose your statement CSV</h3><p>Up to 2 MB. A unique transaction reference is required.</p><input id="statement-file" type="file" accept=".csv,text/csv" aria-label="Choose bank statement CSV"></div><button type="button" class="text-btn" data-action="template">Download example format ${icon("down")}</button>${[
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
  return `${heading("Settings","Make PocketSync feel like your own.","",false)}<div class="settings-grid"><section class="card"><div class="card-head"><div><h2>Appearance & currency</h2><p>Saved for your account on this device</p></div>${icon("settings")}</div>${currencySelector("settings-currency")}<p class="fine muted">Currency selection changes display formatting. Amounts, imports and reports remain in INR; no exchange-rate conversion is applied.</p><div class="accent-picker" role="group" aria-label="Primary accent">${Object.entries(accentThemes).map(([value,theme])=>`<button type="button" data-action="accent" data-accent="${value}" aria-pressed="${accent===value}" class="accent-choice ${accent===value?'active':''}"><span style="background:${theme.color}"></span>${theme.label}</button>`).join('')}</div></section><section class="card"><div class="card-head"><div><h2>Account & privacy</h2><p>Profile, password and sharing controls</p></div>${icon("user")}</div><p class="info-copy">Manage your display name, sign-in security and tracker sharing from your profile.</p>${button("Open my profile "+icon("arrow"),"navigate","primary",'data-target="profile"')}</section><section class="card"><div class="card-head"><div><h2>Data & reports</h2><p>Your records stay with your account</p></div></div><p class="info-copy">Download your ledger as CSV or generate monthly PDF and Excel reports.</p><div class="row settings-actions">${button("Export all transactions","export-all","soft")}${button("Open reports","navigate","soft",'data-target="reports"')}</div></section><section class="card"><div class="card-head"><div><h2>Statement imports</h2><p>Bring bank and UPI records together</p></div></div><p class="info-copy">Upload a CSV statement and review its categories. Imported references are checked for duplicates.</p>${button("Import a statement "+icon("arrow"),"navigate","soft",'data-target="imports"')}</section></div>`;
}
function subscriptionTable(rows) {
  if(!rows.length) return `<div class="empty">${icon("refresh")}<h3>No recurring schedules</h3><p>Add a subscription or recurring bill to track its next billing date.</p>${!readonly()?button("Add subscription","recurring-add","primary sm"):''}</div>`;
  return `<div class="table-wrap"><table class="subscription-table"><thead><tr><th>Service / entry</th><th>Plan</th><th>Billing</th><th>Next billing</th><th class="right">Amount</th><th>Status</th><th>Actions</th></tr></thead><tbody>${rows.map(r=>{
    const c=cat(r.category), status=scheduleStatus(r,today());
    return `<tr><td><div class="description-cell"><span class="service-mark" style="--c:${c.color}">${icon(c.icon)}</span><div><button type="button" class="transaction-name" data-action="recurring-view" data-id="${r.id}">${esc(r.description)}</button><small>${esc(r.category)} · ${r.autoPost?'Auto record':'Manual record'}${r.type==='income'?' · income':''}</small></div></div></td><td>${esc(r.plan)||'—'}</td><td>${cap(r.frequency)}</td><td>${dateLabel(r.nextDate)}</td><td class="amount-cell ${r.type==='income'?'credit':''}">${r.type==='income'?'+':''}${money(cents(r.amount))}</td><td><button type="button" class="pill ${status==='due'?'peach':status==='active'?'mint':status==='completed'?'lav':''}" data-action="subscription-filter" data-status="${status}">${status==='due'?'Due to record':cap(status)}</button></td><td><div class="row-actions">${!readonly()?`${status==='due'?button("Record","recurring-record","sm primary",`data-id="${r.id}" data-due="${r.nextDate}"`):''}<button type="button" class="icon-btn" data-action="recurring-edit" data-id="${r.id}" aria-label="Edit ${esc(r.description)}">${icon('edit')}</button><button type="button" class="icon-btn" data-action="recurring-status" data-id="${r.id}" data-active="${!r.active}" ${status==='completed'?'disabled':''} aria-label="${r.active?'Pause':'Resume'} ${esc(r.description)}">${icon(r.active?'pause':'play')}</button>`:button("Details","recurring-view","sm",`data-id="${r.id}"`)}</div></td></tr>`;
  }).join('')}</tbody></table></div>`;
}
function subscriptionsPage() {
  const all=state.recurring||[], rs=recurringSummary(all,state.transactions,month,today()), rows=filterRecurring(all,subscriptionFilters,today());
  return `${heading("Subscriptions","Manage recurring bills, services and income in one place.",!readonly()?button(icon('plus')+' Add subscription','recurring-add','primary'):'')}
  <div class="stats subscription-stats"><button type="button" class="card stat interactive-stat" data-action="subscription-filter" data-status=""><div class="stat-top">Monthly recurring cost ${icon('refresh')}</div><div class="stat-value">${money(rs.monthly)}</div><p>Active expenses, normalized to a month</p></button><button type="button" class="card stat interactive-stat" data-action="subscription-filter" data-status="active"><div class="stat-top">Active schedules ${icon('card')}</div><div class="stat-value">${rs.active}</div><p>Includes ${rs.due} currently due</p></button><button type="button" class="card stat interactive-stat" data-action="subscription-filter" data-status="due"><div class="stat-top">Due to record ${icon('bell')}</div><div class="stat-value peach">${rs.due}</div><p>${money(rs.dueAmount)} in due expense entries</p></button><button type="button" class="card stat interactive-stat" data-action="recurring-ledger"><div class="stat-top">Recorded this month ${icon('check')}</div><div class="stat-value mint">${money(rs.recorded)}</div><p>${monthName(month)} · view ledger</p></button></div>
  <div class="toolbar"><div class="search">${icon('search')}<input id="subscription-search" type="search" placeholder="Search services or plans" aria-label="Search recurring schedules" value="${esc(subscriptionFilters.search)}"></div><div class="filters"><select data-subfilter="status" aria-label="Schedule status"><option value="">All statuses</option>${options(['active','due','paused','completed'],subscriptionFilters.status)}</select><select data-subfilter="category" aria-label="Subscription category"><option value="">All categories</option>${options(categories.map(c=>c.name),subscriptionFilters.category)}</select><select data-subfilter="order" aria-label="Sort subscriptions">${options(['due','cost','name'],subscriptionFilters.order)}</select>${button('Export CSV','export-recurring','sm')}${!readonly()?button(icon('refresh')+' Sync automatic entries','recurring-sync','sm'):''}</div></div>
  <section class="card"><div class="card-head"><div><h2 id="subscription-count">${rows.length} recurring schedule${rows.length===1?'':'s'}</h2><p>Automatic recording adds due entries to the ledger while the server runs.</p></div>${button(icon('calendar')+' Billing calendar','navigate','soft sm','data-target="calendar"')}</div><div id="subscription-results">${subscriptionTable(rows)}</div><div class="table-foot">Recording does not charge a bank account. Weekly, quarterly and yearly costs are normalized estimates; ledger totals use actual billing amounts.</div></section>`;
}
function profilePage() {
  const a=state.profile, rs=recurringSummary(state.recurring||[],state.transactions,month,today());
  return `${heading('My profile','Your account, security and sharing preferences.','',false)}<section class="card profile-hero"><span class="avatar profile-avatar">${esc(initials(a.name))}</span><div><span class="eyebrow">${a.role==='ADMIN'?'ADMINISTRATOR':'PERSONAL ACCOUNT'}</span><h2>${esc(a.name)}</h2><p>${esc(a.email)}</p><span class="pill lav">Member since ${dateLabel(a.createdAt.slice(0,10))}</span></div><div class="profile-quicklinks">${button(icon('wallet')+' My dashboard','navigate','soft','data-target="overview"')}${button(icon('settings')+' Settings','navigate','soft','data-target="settings"')}</div></section>
  <div class="profile-counts"><button type="button" data-page="transactions"><strong>${state.transactions.length}</strong><span>Ledger entries ${icon('arrow')}</span></button><button type="button" data-page="budgets"><strong>${new Set(state.budgets.map(b=>b.month)).size}</strong><span>Months with budgets ${icon('arrow')}</span></button><button type="button" data-page="subscriptions"><strong>${rs.active}</strong><span>Active recurring schedules ${icon('arrow')}</span></button></div>
  <div class="settings-grid"><section class="card"><div class="card-head"><div><h2>Personal information</h2><p>Edit your display name</p></div>${icon('user')}</div><form data-form="profile">${field('Display name','name','text',a.name,'required maxlength="60" autocomplete="name"')}<div class="field"><label>Sign-in email</label><p class="profile-email">${esc(a.email)}</p></div>${a.role!=='ADMIN'?`<label class="check"><input type="checkbox" name="share" ${a.share?'checked':''}>Allow ${esc(state.adminName)} to view my tracker.</label><p class="fine muted">Sharing grants read-only access to your transactions, budgets, schedules and imports. Revoking it takes effect immediately. Administrator visits are recorded below.</p>`:'<p class="notice">Your administrator account has its own tracker. Other users choose whether to share their data with you.</p>'}${errorBox}<div><button class="btn primary" type="submit">Save profile</button></div></form></section>
  <section class="card"><div class="card-head"><div><h2>Change password</h2><p>Previous sessions are revoked when you save</p></div>${icon('lock')}</div><form data-form="password">${field('Current password','currentPassword','password','','required maxlength="128" autocomplete="current-password"')}${field('New password','newPassword','password','','required minlength="10" maxlength="128" autocomplete="new-password"')}${field('Confirm new password','confirmPassword','password','','required minlength="10" maxlength="128" autocomplete="new-password"')}${errorBox}<div><button class="btn primary" type="submit">Update password</button></div></form></section>
  <section class="card wide"><div class="card-head"><div><h2>Account activity</h2><p>Recent record changes, sharing preferences and access</p></div>${button(icon('refresh')+' Refresh','profile-refresh','sm')}</div>${state.audit.length?`<div class="audit-list">${state.audit.slice(0,20).map(e=>`<div class="audit-entry"><strong>${esc(e.event)}</strong><small>${esc(e.actor)} · ${new Date(e.at).toLocaleString('en-IN')}</small></div>`).join('')}</div>`:empty('No activity yet','Account events will appear here.')}</section></div>`;
}
function budgetHistory() {
  const months=[...new Set([...state.budgets.map(b=>b.month),...state.transactions.map(t=>t.date.slice(0,7))])].sort().reverse();
  return `<section class="card history-card budget-history"><div class="card-head"><div><h2>Budget history</h2><p>Select any month to view its saved limits and actual spending</p></div><select id="history-year" aria-label="Budget history year">${options(availableYears(state,today()),month.slice(0,4))}</select></div>${barChart()}<div class="month-navigation">${button('← Previous month','month-step','soft sm','data-step="-1"')}${button('Current month','current-month','soft sm')}${button('Next month →','month-step','soft sm','data-step="1"')}</div><details class="history-details"><summary>View all recorded months (${months.length})</summary>${months.length?`<div class="table-wrap"><table><thead><tr><th>Month</th><th>Overall budget</th><th>Expenses</th><th>Remaining</th><th>Category limits</th><th>Open</th></tr></thead><tbody>${months.map(m=>{const sm=summary(state,m),limits=state.budgets.filter(b=>b.month===m&&b.category!=='Overall').length;return `<tr><td>${monthName(m)}</td><td>${sm.budget?money(sm.budget):'Not set'}</td><td>${money(sm.spent)}</td><td class="${sm.budget&&sm.left<0?'red':''}">${sm.budget?money(sm.left):'—'}</td><td>${limits}</td><td>${button('View month','history-month','sm',`data-month="${m}"`)}</td></tr>`}).join('')}</tbody></table></div>`:'<p class="small muted">Saved budgets and transactions will appear here.</p>'}</details></section>`;
}
function calendarPage() {
  const events=billingEvents(state.recurring||[],month), [year,number]=month.split('-').map(Number), n=new Date(Date.UTC(year,number,0)).getUTCDate(), offset=(new Date(month+'-01T12:00:00Z').getUTCDay()+6)%7;
  const sum=events.filter(e=>e.type==='expense').reduce((s,e)=>s+cents(e.amount),0), recorded=monthly(state.transactions,month).filter(t=>t.source==='recurring');
  return `${heading('Billing calendar','Plan upcoming subscriptions and recurring payments.',!readonly()?button(icon('plus')+' Add subscription','recurring-add','primary'):'')}<section class="card"><div class="card-head"><div><h2>${monthName(month)}</h2><p>${events.length} planned entries · ${money(sum)} in upcoming expenses</p></div><div class="row">${button('←','month-step','sm','data-step="-1" aria-label="Previous month"')}${button('Today','current-month','sm')}${button('→','month-step','sm','data-step="1" aria-label="Next month"')}</div></div><div class="billing-calendar">${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>`<div class="calendar-weekday">${d}</div>`).join('')}${Array.from({length:offset},()=>'<div class="calendar-blank" aria-hidden="true"></div>').join('')}${Array.from({length:n},(_,i)=>{const date=month+'-'+String(i+1).padStart(2,'0'), entries=events.filter(e=>e.date===date);return `<button type="button" class="calendar-day ${entries.length?'has-bills':''} ${date===today()?'is-today':''}" data-action="calendar-day" data-date="${date}" aria-label="${dateLabel(date)}: ${entries.length} planned billing entries"><span class="calendar-number">${i+1}</span>${entries.slice(0,2).map(e=>`<span class="calendar-event" style="--c:${cat(e.category).color}">${esc(e.description)}</span>`).join('')}${entries.length>2?`<span class="calendar-more">+${entries.length-2} more</span>`:''}</button>`}).join('')}</div><p class="fine muted calendar-note">The calendar shows future or unrecorded active billing dates. Select a day to inspect its entries; completed ledger records appear below.</p></section><section class="card"><div class="card-head"><div><h2>Recorded recurring entries</h2><p>${monthName(month)} · saved in your ledger</p></div>${button('View subscriptions','navigate','soft sm','data-target="subscriptions"')}</div>${recorded.length?ledgerTable(sorted(recorded),false):empty('No recurring entries recorded this month','A due billing appears here after it is recorded.')}</section>`;
}
function recurringDialog(id='', transaction=null) {
  guard(); const saved=id?(state.recurring||[]).find(r=>r.id===id):null;
  if(id&&!saved) throw Error('This schedule is no longer available.');
  const r=saved||{description:transaction?.description||'',plan:'',amount:transaction?.amount||'',category:transaction?.category||'Subscriptions',method:transaction?.method||'Card',type:transaction?.type||'expense',frequency:'monthly',startDate:transaction?nextBilling(transaction.date,transaction.date,'monthly'):today(),endDate:'',notes:transaction?.notes||'',taxAmount:transaction?.taxAmount||'0.00',autoPost:false};
  modalContext={kind:'recurring',id,r};
  showModal(saved?'Edit recurring schedule':'Add subscription or recurring entry','Track billing dates and record repeat transactions.',`<form data-form="recurring"><div class="form-grid">${field('Service / description','description','text',r.description,'required maxlength="100"')}${field('Plan (optional)','plan','text',r.plan,'maxlength="60"')}${field('Billing amount (INR)','amount','number',r.amount,'required min="0.01" max="999999999.99" step="0.01"')}${select('Category','category',categories.map(c=>c.name),r.category)}${select('Billing frequency','frequency',frequencies,r.frequency,saved?'disabled':'')}${field('First billing date','startDate','date',r.startDate,'required min="1900-01-01" max="2100-12-31" '+(saved?'disabled':''))}${field('End date (optional, inclusive)','endDate','date',r.endDate,'min="1900-01-01" max="2100-12-31"')}${select('Entry type','type',['expense','income'],r.type)}${select('Payment method','method',methods,r.method)}${field('Included tax (INR, optional)','taxAmount','number',r.taxAmount,'min="0" max="999999999.99" step="0.01"')}<div class="field wide"><label for="field-notes">Notes (optional)</label><textarea id="field-notes" name="notes" maxlength="500" rows="2">${esc(r.notes)}</textarea></div></div><label class="check"><input type="checkbox" name="autoPost" ${r.autoPost?'checked':''}>Automatically record each due billing in the ledger.</label><p class="fine muted">This records entries only; it does not make a payment. Month-end billing keeps its original day when possible. Paused billing periods are skipped on resume.${saved?' First billing and frequency stay fixed here; create a new schedule to change them.':''}</p>${errorBox}${actions(saved?'Save schedule':'Add schedule')}</form>`,true);
}
function recurringDetails(id) {
  const r=(state.recurring||[]).find(r=>r.id===id); if(!r) throw Error('This schedule is unavailable.');
  const status=scheduleStatus(r,today());
  showModal(r.description,r.plan||cap(r.frequency)+' recurring '+r.type,`<div class="detail-grid"><div><span>Amount per billing</span><strong>${money(cents(r.amount))}</strong></div><div><span>Category</span><strong>${esc(r.category)}</strong></div><div><span>Next billing</span><strong>${dateLabel(r.nextDate)}</strong></div><div><span>Frequency</span><strong>${cap(r.frequency)}</strong></div><div><span>Recording</span><strong>${r.autoPost?'Automatic':'Manual'}</strong></div><div><span>Status</span><strong>${status==='due'?'Due to record':cap(status)}</strong></div><div><span>First billing</span><strong>${dateLabel(r.startDate)}</strong></div><div><span>End date</span><strong>${r.endDate?dateLabel(r.endDate):'No end date'}</strong></div><div><span>Payment method</span><strong>${esc(r.method)}</strong></div><div><span>Included tax</span><strong>${money(Math.round(Number(r.taxAmount)*100))}</strong></div></div>${r.notes?`<p class="modal-note">${esc(r.notes)}</p>`:''}<div class="form-actions wrap">${button('Close','close')}${!readonly()?`${button('Remove','recurring-remove','danger',`data-id="${r.id}"`)}${button('Edit','recurring-edit','soft',`data-id="${r.id}"`)}${status==='due'?button('Record due entry','recurring-record','primary',`data-id="${r.id}" data-due="${r.nextDate}"`):''}`:''}</div>`);
}
function transactionDetails(id) {
  const t=state.transactions.find(t=>t.id===id); if(!t) throw Error('This transaction is unavailable.');
  showModal(t.description,dateLabel(t.date),`<div class="detail-grid"><div><span>Amount</span><strong>${money(cents(t.amount))}</strong></div><div><span>Entry type</span><strong>${cap(t.type)}</strong></div><div><span>Category</span><strong>${esc(t.category)}</strong></div><div><span>Payment method</span><strong>${esc(t.method)}</strong></div><div><span>Source</span><strong>${esc(t.source)}</strong></div><div><span>Included tax</span><strong>${money(Math.round(Number(t.taxAmount)*100))}</strong></div></div>${t.notes?`<p class="modal-note">${esc(t.notes)}</p>`:''}<div class="form-actions wrap">${button('Close','close')}${!readonly()?`${['expense','income'].includes(t.type)?button('Make recurring','recurring-from','soft',`data-id="${t.id}"`):''}${button('Edit transaction','edit','primary',`data-id="${t.id}"`)}`:''}</div>`);
}
function dayDetails(date) {
  const events=billingEvents(state.recurring||[],date.slice(0,7)).filter(r=>r.date===date);
  showModal(dateLabel(date),`${events.length} planned billing entries`,events.length?`<div class="day-bills">${events.map(r=>`<button type="button" class="day-bill" data-action="recurring-view" data-id="${r.id}"><span class="service-mark" style="--c:${cat(r.category).color}">${icon(cat(r.category).icon)}</span><span><strong>${esc(r.description)}</strong><small>${esc(r.category)} · ${cap(r.frequency)}</small></span><strong>${money(cents(r.amount))}</strong>${icon('chevron')}</button>`).join('')}</div><div class="form-actions">${button('Close','close')}</div>`:`<p class="notice">No active recurring billing is scheduled on this date.</p><div class="form-actions">${button('Close','close')}${!readonly()?button('Add subscription','recurring-on-date','primary',`data-date="${date}"`):''}</div>`);
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
  loadAppearance();
  directory = null;
  dismissed.clear();
  subscriptionFilters = {search:"",category:"",status:"",order:"due"};
  filters = { search: "", category: "", type: "", method: "", range: "selected", start: "", end: "" };
  month = today().slice(0, 7);
  const requested=new URLSearchParams(location.hash.slice(1));
  page = Object.hasOwn(labels,requested.get('page')) && (requested.get('page')!=='admin'||state.viewer.role==='ADMIN') ? requested.get('page') : state.viewer.role==='ADMIN'?'admin':'overview';
  if(/^\d{4}-(0[1-9]|1[0-2])$/.test(requested.get('month')||'')&&requested.get('month')>='1900-01'&&requested.get('month')<='2100-12') month=requested.get('month');
  if (page === "admin") directory = await api("admin/users");
  render();
}
async function navigate(target) {
  if (target === "admin") {
    await openAdmin();
    return;
  }
  if (readonly() && ["settings","profile"].includes(target)) { state=await api("state"); loadAppearance(); }
  if (readonly() && target === "imports") return;
  if (!Object.hasOwn(labels,target)) throw Error("This page is unavailable.");
  history.pushState(null,"",location.pathname+"#page="+target+"&month="+month);
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
    )}${select("Payment method", "method", methods, t?.method || (cash ? "Cash" : "UPI"), linked ? "disabled" : "")}${field("Tax included (INR, optional)", "taxAmount", "number", t?.taxAmount || "0.00", 'min="0" max="999999999.99" step="0.01"')}<div class="field wide"><label for="field-notes">Notes (optional)</label><textarea id="field-notes" name="notes" maxlength="500" rows="2">${esc(t?.notes || "")}</textarea></div></div>${errorBox}${actions(t ? "Save changes" : "Add transaction")}</form>`,
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
    `<form data-form="budget"><div class="form-grid">${field("Month", "month", "month", month, 'required min="1900-01" max="2100-12"')}${select("Budget for", "category", ["Overall", ...categories.map((c) => c.name)], category)}${field("Budget amount (₹)", "amount", "number", b?.amount || "", 'required min="0.01" max="999999999.99" step="0.01"')}</div>${errorBox}<div class="form-actions">${button("Cancel","close")}${b?button("Remove limit","budget-remove","danger",`data-id="${b.id}"`):""}<button class="btn primary" type="submit">Save budget</button></div></form>`,
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
      cents(t.amount) === cents(i.amount) &&
      directionOK(i, t.type) &&
      t.date === i.date && t.method === i.method,
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
          ? `<p class="notice" style="margin-bottom:18px">Link to an unlinked entry with the same date, amount and payment method. This keeps one ledger entry and preserves your category and notes.</p>${
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
  const csv = csvText(rows), url = URL.createObjectURL(new Blob([csv], {type:"text/csv;charset=utf-8"})),
    a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}
function exportRows(rows) {
  guard();
  downloadCSV("pocketsync-expenses-" + filters.range + "-" + month + ".csv", [
    [
      "date",
      "description",
      "category",
      "amount",
      "type",
      "method",
      "notes",
      "source",
      "currency",
      "tax_amount",
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
      "INR",
      t.taxAmount || "0.00",
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
  if ((event.ctrlKey||event.metaKey) && event.key.toLowerCase()==='k' && state && !busy) {event.preventDefault();navigate('transactions').then(()=>root.querySelector('#transaction-search')?.focus()).catch(e=>toast(e.message,true));}
  if ((event.key==='Enter'||event.key===' ') && event.target.matches?.('[data-action]:not(button)')) {event.preventDefault();event.target.click();}
  if (event.key === "Escape" && root.querySelector(".nav-open")) setMenu(false);
});
async function perform(action, el) {
  if(action==='history-month') {
    if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(el.dataset.month)) throw Error('Choose a valid month.');
    month=el.dataset.month; filters.range='selected'; await navigate('budgets'); return;
  }
  if(action==='month-step' || action==='current-month') {
    const value=action==='current-month'?today().slice(0,7):monthShift(month,Number(el.dataset.step));
    if(value<'1900-01'||value>'2100-12') throw Error('Reporting months are available from 1900 to 2100.');
    month=value; filters.range='selected'; render(); return;
  }
  if(action==='global-search') { await navigate('transactions'); root.querySelector('#transaction-search')?.focus(); return; }
  if(action==='month-ledger' || action==='category-ledger' || action==='method-ledger' || action==='recurring-ledger') {
    filters={search:'',category:el.dataset.category||'',method:el.dataset.method||'',type:'expense',range:'selected',start:'',end:''};
    if(action==='recurring-ledger') {filters.search=''; filters.source='recurring';}
    await navigate('transactions'); return;
  }
  if(action==='stat-explore') {
    const label=el.dataset.label;
    if(label==='Budget remaining') {await navigate('budgets');return;}
    if(['Registered users','Shared trackers','Shared spending','Awaiting review'].includes(label)) {await openAdmin();return;}
    filters={search:'',category:'',method:label==='Paid with UPI'?'UPI':label==='Paid with cash'?'Cash':'',type:label==='Money in'||label==='Recorded income'?'income':label==='Refunds received'?'refund':label==='Recorded net'?'':'expense',range:'selected',start:'',end:''};
    await navigate('transactions');return;
  }
  if(action==='due-subscriptions' || action==='subscription-filter') {
    subscriptionFilters.status=action==='due-subscriptions'?'due':el.dataset.status||'';
    subscriptionFilters.search=''; subscriptionFilters.category='';
    await navigate('subscriptions');return;
  }
  if(action==='transaction-view') {transactionDetails(el.dataset.id);return;}
  if(action==='recurring-view') {recurringDetails(el.dataset.id);return;}
  if(action==='calendar-day') {dayDetails(el.dataset.date);return;}
  if(action==='export-recurring') {
    downloadCSV('pocketsync-subscriptions.csv',[
      ['service','plan','category','amount','currency','type','frequency','first_billing','next_billing','end_date','status','method','auto_record','included_tax'],
      ...filterRecurring(state.recurring||[],subscriptionFilters,today()).map(r=>[r.description,r.plan,r.category,r.amount,'INR',r.type,r.frequency,r.startDate,r.nextDate,r.endDate,scheduleStatus(r,today()),r.method,r.autoPost,r.taxAmount])]);
    toast('Schedules exported.');return;
  }
  if(action==='profile-refresh') {state=await api('state');render();toast('Profile refreshed.');return;}

  if (action === "accent") { accent = el.dataset.accent; saveAppearance(); render(); return; }
  if (action === "date-range") {
    filters.range = el.dataset.range;
    if (filters.range === "custom" && !filters.start) { const range = dateRange("selected", month, today()); filters.start = range.start; filters.end = range.end; }
    render(); return;
  }
  if (action === "report-xlsx" || action === "report-pdf") { await downloadReport(action.slice(7)); return; }
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
    state = null; accessToken = ""; displayCurrency = "INR"; accent = "sapphire";
    document.documentElement.style.setProperty("--mint", accentThemes.sapphire.color);
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
  if(action==='export-all') {exportRows(sorted(state.transactions));return;}
  if(action==='recurring-add' || action==='recurring-edit') {recurringDialog(el.dataset.id||'');return;}
  if(action==='recurring-from') {recurringDialog('',state.transactions.find(t=>t.id===el.dataset.id));return;}
  if(action==='recurring-on-date') {recurringDialog(); modal.querySelector('[name=startDate]').value=el.dataset.date;return;}
  if(action==='recurring-record') {
    state=await api('recurring/'+el.dataset.id+'/record','POST',{dueDate:el.dataset.due});
    closeModal();render();toast('Due entry recorded in your ledger.');return;
  }
  if(action==='recurring-status') {
    state=await api('recurring/'+el.dataset.id+'/status','PUT',{active:el.dataset.active});
    render();toast(el.dataset.active==='true'?'Schedule resumed; paused periods skipped.':'Schedule paused.');return;
  }
  if(action==='recurring-sync') {
    const result=await api('recurring/sync','POST');state=result.state;render();toast(result.recorded+' automatic entries recorded.');return;
  }
  if(action==='recurring-remove') {
    const r=(state.recurring||[]).find(r=>r.id===el.dataset.id);if(!r)throw Error('This schedule is unavailable.');
    modalContext={kind:'recurring-delete',id:r.id};
    showModal('Remove recurring schedule?',r.description,`<p class="notice">Future billing entries will stop. Transactions already recorded stay in your ledger.</p><form data-form="recurring-delete">${errorBox}${actions('Remove schedule')}</form>`);return;
  }
  if(action==='budget-remove') {
    const b=state.budgets.find(b=>b.id===el.dataset.id);if(!b)throw Error('This budget is unavailable.');
    modalContext={kind:'budget-delete',id:b.id};
    showModal('Remove budget limit?',b.category+' · '+monthName(b.month),`<p class="notice">This removes the saved limit of ${money(cents(b.amount))}. Your transactions remain saved.</p><form data-form="budget-delete">${errorBox}${actions('Remove limit')}</form>`);return;
  }
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
  if (kind === 'recurring') {
    const {id,r}=modalContext;
    if(id) {f.startDate=r.startDate;f.frequency=r.frequency;}
    state=await api('recurring'+(id?'/'+id:''),id?'PUT':'POST',f);
    closeModal();render();toast(id?'Schedule updated.':'Recurring schedule added.');return;
  }
  if (kind === 'recurring-delete' || kind === 'budget-delete') {
    state=await api((kind==='recurring-delete'?'recurring/':'budgets/')+modalContext.id,'DELETE');
    closeModal();render();toast(kind==='recurring-delete'?'Schedule removed; recorded entries retained.':'Budget limit removed.');return;
  }
  if (kind === "smart-import") {
    const upload = new FormData(form), file = upload.get("file");
    if (!file || !file.size || file.size > 2 * 1024 * 1024) throw Error("Choose a CSV of 2 MB or smaller.");
    const response = await authorizedFetch("statements/import", {method:"POST", body:upload});
    const result = await response.json(); if (!response.ok) throw Error(result.error || "Import failed.");
    state = result.state; page = "transactions"; filters.range="all"; render(); toast(result.imported + " transactions imported; " + result.duplicates + " duplicates skipped."); return;
  }
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
  if(el.dataset.subfilter) {subscriptionFilters[el.dataset.subfilter]=el.value;render();return;}
  if(el.id==='history-year') {month=el.value+'-'+month.slice(5);filters.range='selected';render();return;}
  if(modalContext.kind==='budget' && (el.name==='month'||el.name==='category')) {
    const form=el.closest('form'), saved=state.budgets.find(b=>b.month===form.elements.month.value&&b.category===form.elements.category.value);
    form.elements.amount.value=saved?.amount||'';return;
  }
  if (el.id === "display-currency" || el.id === "settings-currency") {
    displayCurrency = el.value; saveAppearance(); render(); return;
  }
  if (el.id === "report-month" && /^\d{4}-\d{2}$/.test(el.value)) {
    month = el.value; filters.range = "selected";
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
  if (el.id === 'subscription-search') {
    subscriptionFilters.search=el.value;const rows=filterRecurring(state.recurring||[],subscriptionFilters,today());
    document.querySelector('#subscription-results').innerHTML=subscriptionTable(rows);
    document.querySelector('#subscription-count').textContent=rows.length+' recurring schedule'+(rows.length===1?'':'s');
  }
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
window.addEventListener('popstate', async ()=>{
  if(!state||busy) return;
  const route=new URLSearchParams(location.hash.slice(1)), target=route.get('page');
  if(!Object.hasOwn(labels,target)) return;
  try {
    if(target==='admin') {await openAdmin();return;}
    if(readonly()&&['profile','settings'].includes(target)) state=await api('state');
    if(readonly()&&target==='imports') return;
    const value=route.get('month');
    if(/^\d{4}-(0[1-9]|1[0-2])$/.test(value||'')&&value>='1900-01'&&value<='2100-12') month=value;
    page=target;render();
  } catch(e) {toast(e.message,true);}
});
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
