/** Pure presentation rules. Amounts remain INR; selecting a currency changes formatting only. */
export const currencyLocales = { INR: "en-IN", USD: "en-US", EUR: "de-DE" };
export const accentThemes = {
  sapphire: { label: "Sapphire Blue", color: "#6b8cff" },
  mint: { label: "Mint Green", color: "#cbe7a1" },
  ocean: { label: "Ocean Blue", color: "#9dccf5" },
  amber: { label: "Warm Amber", color: "#f0ca86" },
};
export function formatMoney(minorUnits, currency = "INR", compact = false) {
  if (!Number.isFinite(minorUnits) || !currencyLocales[currency]) throw Error("Invalid currency amount.");
  return new Intl.NumberFormat(currencyLocales[currency], {
    style: "currency", currency, maximumFractionDigits: compact ? 1 : 2,
    minimumFractionDigits: compact ? 0 : (minorUnits % 100 ? 2 : 0),
    ...(compact ? { notation: "compact" } : {}),
  }).format(minorUnits / 100);
}
export function budgetProgress(spent, limit) {
  if (!Number.isFinite(spent) || !Number.isFinite(limit) || spent < 0 || limit < 0) throw Error("Invalid budget.");
  const percentage = limit ? spent / limit * 100 : 0;
  return { percentage, fill: Math.min(100, percentage), set: limit > 0,
    color: percentage >= 100 ? "var(--red)" : percentage >= 80 ? "var(--peach)" : "var(--mint)" };
}
export function dateRange(range, selectedMonth, today, start = "", end = "") {
  if (range === "all") return { start: "", end: "" };
  if (range === "custom") return { start, end };
  if (range === "last30") {
    const first = new Date(today + "T12:00:00Z");
    first.setUTCDate(first.getUTCDate() - 29);
    return { start: first.toISOString().slice(0, 10), end: today };
  }
  const month = range === "month" ? today.slice(0, 7) : selectedMonth;
  const last = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0));
  return { start: month + "-01", end: last.toISOString().slice(0, 10) };
}
export function filterRows(rows, filters, month, today) {
  const range = dateRange(filters.range, month, today, filters.start, filters.end);
  return rows.filter((row) => (!range.start || row.date >= range.start) && (!range.end || row.date <= range.end)
    && (!filters.source || row.source === filters.source)
    && (!filters.category || row.category === filters.category)
    && (!filters.type || row.type === filters.type) && (!filters.method || row.method === filters.method)
    && (!filters.search || (row.description + " " + (row.notes || "")).toLowerCase().includes(filters.search.toLowerCase())));
}
export function csvText(rows) {
  const cell = (value) => {
    let text = String(value ?? "");
    if (/^[\s]*[=+@-]/.test(text)) text = "'" + text;
    return '"' + text.replaceAll('"', '""') + '"';
  };
  return "\uFEFF" + rows.map((row) => row.map(cell).join(",")).join("\r\n");
}
