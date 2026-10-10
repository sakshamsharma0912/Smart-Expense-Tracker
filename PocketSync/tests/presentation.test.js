import test from "node:test";
import assert from "node:assert/strict";
import { formatMoney, budgetProgress, dateRange, filterRows, csvText } from "../src/main/resources/static/presentation.js";
import { parseCSV, summary, cents } from "../src/main/resources/static/logic.js";

test("currency formats preserve the base numeric value", () => {
  assert.equal(formatMoney(123456, "INR"), "₹1,234.56");
  assert.equal(formatMoney(123456, "USD"), "$1,234.56");
  assert.equal(formatMoney(123456, "EUR").replace(/\s/g, ""), "1.234,56€");
  assert.match(formatMoney(10000000, "USD", true), /100K/);
});
test("last 30 days includes today and handles month/year boundaries", () => {
  assert.deepEqual(dateRange("last30", "2025-01", "2026-01-10"), {start:"2025-12-12",end:"2026-01-10"});
  assert.deepEqual(dateRange("month", "2025-11", "2024-02-20"), {start:"2024-02-01",end:"2024-02-29"});
  assert.deepEqual(dateRange("selected", "2026-02", "2026-03-01"), {start:"2026-02-01",end:"2026-02-28"});
});
const rows = [
  {date:"2026-09-10",description:"Café, lunch",category:"Food",amount:"120.50",type:"expense",method:"UPI",notes:"college"},
  {date:"2026-10-01",description:"Train ticket",category:"Travel",amount:"300.00",type:"expense",method:"Card",notes:""},
  {date:"2026-10-10",description:"Coffee",category:"Food",amount:"40.00",type:"expense",method:"UPI",notes:""},
  {date:"2026-10-11",description:"Future lunch",category:"Food",amount:"100.00",type:"expense",method:"UPI",notes:""},
];
test("date pills and search/payment/category filters compose", () => {
  const f = {range:"last30",category:"Food",method:"UPI",search:"COFFEE"};
  assert.deepEqual(filterRows(rows,f,"2026-09","2026-10-10"), [rows[2]]);
  assert.equal(filterRows(rows,{range:"month"},"2026-09","2026-10-10").length,3);
  assert.equal(filterRows(rows,{range:"all"},"2026-09","2026-10-10").length,4);
  assert.deepEqual(filterRows(rows,{range:"custom",start:"2026-10-01",end:"2026-10-01"},"2026-10","2026-10-10"),[rows[1]]);
  assert.equal(filterRows(rows,{range:"custom",start:"2026-10-10",end:"2026-10-01"},"2026-10","2026-10-10").length,0);
});
test("budget ring handles unset, warning, exceeded and clamped spending", () => {
  assert.equal(budgetProgress(0,0).set,false);
  assert.equal(budgetProgress(79,100).color,"var(--mint)");
  assert.equal(budgetProgress(80,100).color,"var(--peach)");
  assert.equal(budgetProgress(100,100).color,"var(--red)");
  assert.equal(budgetProgress(125,100).percentage,125);
  assert.equal(budgetProgress(125,100).fill,100);
});
test("CSV quoting preserves delimiters and Unicode and neutralizes formulas", () => {
  const csv = csvText([["description","amount"],['Café, "lunch"\nwith friends',"120.50"],[" =HYPERLINK(\"evil\")","0.01"]]);
  assert.ok(csv.startsWith("\uFEFF"));
  const parsed = parseCSV(csv);
  assert.equal(parsed[1][0], 'Café, "lunch"\nwith friends');
  assert.equal(parsed[2][0], "' =HYPERLINK(\"evil\")");
});
test("summary separates income, refunds and transfers from expenses", () => {
  const state={transactions:[...rows,{...rows[2],amount:"1000.00",type:"income"},{...rows[2],amount:"50.00",type:"refund"},{...rows[2],amount:"900.00",type:"transfer"}],budgets:[{month:"2026-10",category:"Overall",amount:"1000.00"}],inbox:[]};
  const s=summary(state,"2026-10");
  assert.equal(s.spent,cents("440.00"));assert.equal(s.income,cents("1000.00"));
  assert.equal(s.refunds,cents("50.00"));assert.equal(s.budget,cents("1000.00"));
});
