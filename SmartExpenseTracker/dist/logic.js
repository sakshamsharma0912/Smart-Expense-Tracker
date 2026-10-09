export const categories = [
  { name: "Food", color: "#cbe7a1", icon: "food" },
  { name: "Travel", color: "#adbde0", icon: "travel" },
  { name: "Shopping", color: "#d7b792", icon: "bag" },
  { name: "Education", color: "#8ebeb4", icon: "book" },
  { name: "Bills", color: "#bfa5bc", icon: "receipt" },
  { name: "Health", color: "#dc9c92", icon: "heart" },
  { name: "Entertainment", color: "#d0cc8b", icon: "play" },
  { name: "Other", color: "#a8b29c", icon: "wallet" },
];
export const methods = ["Cash", "UPI", "Card", "Bank", "Other"];
export const types = ["expense", "income", "refund", "transfer"];
export const today = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export const uid = () => crypto.randomUUID();
export const clone = (x) => structuredClone(x);
export function cents(v) {
  let s = String(v).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(s))
    throw Error("Use a positive amount with at most two decimal places.");
  let [a, b = ""] = s.split("."),
    n = Number(a) * 100 + Number(b.padEnd(2, "0"));
  if (!Number.isSafeInteger(n) || n < 1 || n > 99999999999)
    throw Error("Amount must be between 0.01 and 999999999.99.");
  return n;
}
export const decimal = (n) => (n / 100).toFixed(2);
export function validDate(v) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || v < "1900-01-01" || v > "2100-12-31")
    return false;
  const d = new Date(v + "T12:00:00Z");
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function monthShift(m, n) {
  const d = new Date(m + "-01T12:00:00Z");
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 7);
}
export const total = (rows) => rows.reduce((n, t) => n + cents(t.amount), 0);
export const sorted = (rows) =>
  rows
    .map((r, i) => ({ ...r, _i: i }))
    .sort((a, b) => b.date.localeCompare(a.date) || b._i - a._i);
export const monthly = (rows, m) => rows.filter((t) => t.date.startsWith(m));
export function validateTransaction(f) {
  let description = String(f.description || "").trim();
  if (!description || description.length > 100)
    throw Error("Enter a description of 1–100 characters.");
  if (!validDate(f.date)) throw Error("Choose a valid date.");
  if (
    !categories.some((c) => c.name === f.category) ||
    !methods.includes(f.method) ||
    !types.includes(f.type)
  )
    throw Error("Check the category, type and payment method.");
  if (String(f.notes || "").length > 500)
    throw Error("Keep notes under 500 characters.");
  return {
    date: f.date,
    description,
    amount: decimal(cents(f.amount)),
    category: f.category,
    method: f.method,
    type: f.type,
    notes: f.notes || "",
  };
}
export function summary(s, m) {
  const rows = monthly(s.transactions, m),
    expenses = rows.filter((t) => t.type === "expense"),
    spent = total(expenses),
    income = total(rows.filter((t) => t.type === "income")),
    refunds = total(rows.filter((t) => t.type === "refund")),
    b = s.budgets.find((b) => b.month === m && b.category === "Overall"),
    budget = b ? cents(b.amount) : 0;
  return {
    rows,
    expenses,
    spent,
    income,
    refunds,
    budget,
    left: budget - spent,
    cash: total(expenses.filter((t) => t.method === "Cash")),
    upi: total(expenses.filter((t) => t.method === "UPI")),
    pending: s.inbox.filter((i) => i.status === "pending").length,
  };
}
export function breakdown(rows) {
  return categories
    .map((c) => ({
      ...c,
      value: total(rows.filter((t) => t.category === c.name)),
    }))
    .filter((c) => c.value > 0)
    .sort((a, b) => b.value - a.value);
}
export function suggest(desc) {
  const s = desc.toLowerCase();
  for (const [re, c] of [
    [/canteen|cafe|coffee|food|grocery|restaurant|dosa|swiggy|zomato/, "Food"],
    [/metro|uber|ola|train|fuel|bus/, "Travel"],
    [/book|college|tuition|course|stationery/, "Education"],
    [/amazon|flipkart|shopping|shoe|clothes/, "Shopping"],
    [/netflix|spotify|cinema|movie|game/, "Entertainment"],
    [/recharge|electric|bill|rent|internet/, "Bills"],
    [/pharmacy|clinic|hospital|doctor/, "Health"],
  ])
    if (re.test(s)) return c;
  return "Other";
}
export function directionOK(item, type) {
  return item.direction === "DEBIT"
    ? ["expense", "transfer"].includes(type)
    : ["income", "refund", "transfer"].includes(type);
}
export function incoming(f, source = "statement") {
  if (!f.transaction_id || !f.account || !f.description)
    throw Error("Reference, account label and description are required.");
  if (
    !validDate(f.date) ||
    !["DEBIT", "CREDIT"].includes(f.direction) ||
    !methods.includes(f.method)
  )
    throw Error("Check the transaction date, direction, and method.");
  return {
    id: uid(),
    key: f.account + "\u0000" + f.transaction_id,
    reference: f.transaction_id,
    account: f.account,
    date: f.date,
    description: f.description,
    amount: decimal(cents(f.amount)),
    direction: f.direction,
    method: f.method,
    source,
    suggested: suggest(f.description),
    status: "pending",
    ledgerId: "",
    note: "",
    receivedAt: new Date().toISOString(),
  };
}
export function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  let rows = [],
    row = [],
    value = "",
    quoted = false,
    closed = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (quoted && text[i + 1] === '"') {
        value += '"';
        i++;
      } else if (quoted) {
        quoted = false;
        closed = true;
      } else if (!value && !closed) quoted = true;
      else throw Error("Invalid CSV quote.");
    } else if ((c === "," || c === "\n" || c === "\r") && !quoted) {
      row.push(value);
      value = "";
      closed = false;
      if (c !== ",") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        if (row.some((c) => c.trim())) rows.push(row);
        row = [];
      }
    } else {
      if (closed) throw Error("Unexpected character after a CSV quote.");
      value += c;
    }
  }
  if (quoted) throw Error("Unclosed CSV quote.");
  row.push(value);
  if (row.some((c) => c.trim())) rows.push(row);
  return rows;
}
export const aliases = {
  id: ["transaction_id", "reference", "utr", "ref no", "reference no"],
  date: ["date", "transaction date", "txn date"],
  description: ["description", "narration", "particulars"],
  amount: ["amount"],
  direction: ["direction", "type"],
  debit: ["debit", "withdrawal", "withdrawals"],
  credit: ["credit", "deposit", "deposits"],
  method: ["method", "payment_method"],
  account: ["account"],
};
export function autoMapping(header) {
  return Object.fromEntries(
    Object.entries(aliases).map(([k, values]) => [
      k,
      header.findIndex((h) => values.includes(h.trim().toLowerCase())),
    ]),
  );
}
export function parseImport(s, f) {
  const rows = parseCSV(f.csv),
    h = rows[0];
  if (!h || rows.length < 2)
    throw Error("Choose a CSV with a header and transaction rows.");
  const mapping = autoMapping(h);
  for (const key of Object.keys(mapping))
    if (f["map_" + key] !== undefined && f["map_" + key] !== "")
      mapping[key] = Number(f["map_" + key]);
  const cell = (r, k) => (mapping[k] < 0 ? "" : (r[mapping[k]] || "").trim());
  const split = f.amountMode === "split";
  if (
    mapping.id < 0 ||
    mapping.date < 0 ||
    mapping.description < 0 ||
    (!split && (mapping.amount < 0 || mapping.direction < 0)) ||
    (split && mapping.debit < 0 && mapping.credit < 0)
  )
    throw Error("Map the reference, date, description and amount columns.");
  let result = [],
    duplicates = 0,
    seen = new Map(s.inbox.map((i) => [i.account + "\u0000" + i.reference, i]));
  const clean = (v) => String(v).replaceAll(",", "").replaceAll("₹", "").trim();
  for (let n = 1; n < rows.length; n++) {
    try {
      const r = rows[n];
      if (r.length !== h.length)
        throw Error("Column count differs from the header.");
      let date = cell(r, "date");
      if (f.dateFormat === "DMY") {
        const parts = date.replaceAll("-", "/").split("/");
        if (parts.length !== 3) throw Error("Use DD/MM/YYYY dates.");
        date = `${parts[2]}-${parts[1]}-${parts[0]}`;
      }
      let amount, direction;
      if (split) {
        const db = clean(cell(r, "debit")),
          cr = clean(cell(r, "credit"));
        if (
          (db && db !== "-" && !/^\d+(\.\d{1,2})?$/.test(db)) ||
          (cr && cr !== "-" && !/^\d+(\.\d{1,2})?$/.test(cr))
        )
          throw Error("Invalid debit or credit.");
        if (Number(db) > 0 === Number(cr) > 0)
          throw Error("Exactly one of debit or credit must be positive.");
        amount = Number(db) > 0 ? db : cr;
        direction = Number(db) > 0 ? "DEBIT" : "CREDIT";
      } else {
        amount = clean(cell(r, "amount"));
        const d = cell(r, "direction").toUpperCase();
        direction = ["DEBIT", "DR", "D"].includes(d)
          ? "DEBIT"
          : ["CREDIT", "CR", "C"].includes(d)
            ? "CREDIT"
            : "";
      }
      let t = incoming(
          {
            transaction_id: cell(r, "id"),
            date,
            description: cell(r, "description"),
            amount,
            direction,
            method: cell(r, "method") || f.defaultMethod || "Bank",
            account: cell(r, "account") || f.defaultAccount,
          },
          "statement",
        ),
        old = seen.get(t.key);
      if (old) {
        if (
          [
            "date",
            "amount",
            "direction",
            "description",
            "method",
            "account",
          ].some((k) => old[k] !== t[k])
        )
          throw Error("This reference already exists with different details.");
        duplicates++;
      } else {
        seen.set(t.key, t);
        result.push(t);
      }
    } catch (e) {
      throw Error(`Row ${n + 1}: ${e.message}`);
    }
  }
  if (s.inbox.length + result.length > 10000)
    throw Error("Maximum imported-entry count reached.");
  return { rows: result, duplicates, newCount: result.length };
}
