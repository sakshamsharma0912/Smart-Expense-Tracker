import { cents, monthShift, monthly, summary, validDate } from "./logic.js";

export const subscriptionCategories = ["Subscriptions", "Streaming", "Music", "Software", "Cloud Storage", "Fitness", "Memberships"];
export const frequencies = ["weekly", "monthly", "quarterly", "yearly"];
export function nextBilling(anchor, date, frequency) {
  if (!validDate(anchor) || !validDate(date) || !frequencies.includes(frequency)) throw Error("Invalid billing schedule.");
  if (frequency === "weekly") {
    const value = new Date(date + "T12:00:00Z"); value.setUTCDate(value.getUTCDate() + 7);
    return value.toISOString().slice(0, 10);
  }
  const next = monthShift(date.slice(0,7), {monthly:1,quarterly:3,yearly:12}[frequency]);
  const last = new Date(Date.UTC(Number(next.slice(0,4)), Number(next.slice(5)), 0)).getUTCDate();
  return next + "-" + String(Math.min(Number(anchor.slice(8)), last)).padStart(2,"0");
}
export function scheduleStatus(r, date) {
  if (r.endDate && r.nextDate > r.endDate) return "completed";
  if (!r.active) return "paused";
  return r.nextDate <= date ? "due" : "active";
}
export function monthlyEquivalent(r) {
  return Math.round(cents(r.amount) * ({weekly:52/12,monthly:1,quarterly:1/3,yearly:1/12}[r.frequency] || 0));
}
export function recurringSummary(rows, transactions, month, date) {
  const active = rows.filter(r => ["active","due"].includes(scheduleStatus(r,date)));
  const expenses = active.filter(r => r.type === "expense");
  const due = active.filter(r => scheduleStatus(r,date) === "due");
  return {active:active.length,due:due.length,dueAmount:due.filter(r=>r.type==="expense").reduce((sum,r)=>sum+cents(r.amount),0),
    monthly:expenses.reduce((sum,r)=>sum+monthlyEquivalent(r),0),
    recorded:monthly(transactions,month).filter(t=>t.source==="recurring"&&t.type==="expense").reduce((sum,r)=>sum+cents(r.amount),0)};
}
export function filterRecurring(rows, filters, date) {
  return rows.filter(r=>(!filters.category || r.category===filters.category)
    && (!filters.status || (filters.status==="active" ? ["active","due"].includes(scheduleStatus(r,date)) : scheduleStatus(r,date)===filters.status))
    && (!filters.search || (r.description+" "+r.plan+" "+r.notes).toLowerCase().includes(filters.search.toLowerCase())))
    .sort((a,b)=>filters.order==="cost" ? cents(b.amount)-cents(a.amount) : filters.order==="name" ? a.description.localeCompare(b.description) : a.nextDate.localeCompare(b.nextDate));
}
export function billingEvents(rows, month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw Error("Choose a valid month.");
  const start=month+"-01", end=monthShift(month,1)+"-01", events=[];
  for (const r of rows.filter(r=>r.active)) {
    let date=r.nextDate, loops=0;
    while(date < end && (!r.endDate || date<=r.endDate) && loops++<1000) {
      if(date>=start) events.push({...r,date});
      date=nextBilling(r.startDate,date,r.frequency);
    }
  }
  return events.sort((a,b)=>a.date.localeCompare(b.date)||a.description.localeCompare(b.description));
}
export function historyMonths(state, year) {
  if (!/^\d{4}$/.test(String(year)) || Number(year)<1900 || Number(year)>2100) throw Error("Choose a valid history year.");
  return Array.from({length:12},(_,i)=>{
    const month=year+"-"+String(i+1).padStart(2,"0");
    const s=summary(state,month);
    return {month,spent:s.spent,budget:s.budget,income:s.income,remaining:s.budget-s.spent,hasBudget:s.budget>0};
  });
}
export function availableYears(state, date) {
  return [...new Set([date.slice(0,4), String(Number(date.slice(0,4))-1), String(Number(date.slice(0,4))-2),
    ...state.transactions.map(r=>r.date.slice(0,4)),...state.budgets.map(r=>r.month.slice(0,4)),...((state.recurring||[]).map(r=>r.nextDate.slice(0,4)))])]
    .filter(y=>Number(y)>=1900&&Number(y)<=2100).sort().reverse();
}
