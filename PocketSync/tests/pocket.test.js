import test from 'node:test';
import assert from 'node:assert/strict';
import { nextBilling, billingEvents, recurringSummary, scheduleStatus, filterRecurring, historyMonths } from '../src/main/resources/static/pocket.js';
import { categories, suggest } from '../src/main/resources/static/logic.js';
import { filterRows } from '../src/main/resources/static/presentation.js';
const row={id:'r1',description:'Music service',plan:'Student',category:'Music',amount:'99.50',frequency:'monthly',startDate:'2026-01-31',nextDate:'2026-09-30',endDate:'',active:true,autoPost:false,type:'expense',notes:''};
test('billing keeps its anchor across short months and leap years',()=>{
  assert.equal(nextBilling('2024-01-31','2024-01-31','monthly'),'2024-02-29');
  assert.equal(nextBilling('2024-01-31','2024-02-29','monthly'),'2024-03-31');
  assert.equal(nextBilling('2024-02-29','2024-02-29','yearly'),'2025-02-28');
  assert.equal(nextBilling('2024-02-29','2027-02-28','yearly'),'2028-02-29');
  assert.equal(nextBilling('2026-01-31','2026-01-31','quarterly'),'2026-04-30');
  assert.equal(nextBilling('2026-12-28','2026-12-28','weekly'),'2027-01-04');
});
test('calendar contains only active, unrecorded billing dates in the chosen month',()=>{
  const events=billingEvents([row,{...row,id:'paused',active:false},{...row,id:'ended',endDate:'2026-09-30'},{...row,id:'weekly',frequency:'weekly',startDate:'2026-10-01',nextDate:'2026-10-01'}],'2026-10');
  assert.equal(events.filter(e=>e.id==='r1')[0].date,'2026-10-31');
  assert.equal(events.filter(e=>e.id==='weekly').length,5);
  assert.equal(events.filter(e=>['paused','ended'].includes(e.id)).length,0);
});
test('schedule states distinguish due, future, paused and complete',()=>{
  assert.equal(scheduleStatus(row,'2026-10-11'),'due');
  assert.equal(scheduleStatus({...row,nextDate:'2026-11-30'},'2026-10-11'),'active');
  assert.equal(scheduleStatus({...row,active:false},'2026-10-11'),'paused');
  assert.equal(scheduleStatus({...row,endDate:'2026-09-01'},'2026-10-11'),'completed');
});
test('monthly equivalents include expenses only and actual totals never double-count schedules',()=>{
  const rows=[row,{...row,id:'annual',frequency:'yearly',amount:'1200.00',nextDate:'2026-11-01'},{...row,id:'salary',type:'income',amount:'10000.00'},{...row,id:'paused',active:false}];
  const totals=recurringSummary(rows,[{date:'2026-10-01',type:'expense',source:'recurring',amount:'99.50'},{date:'2026-10-01',type:'expense',source:'manual',amount:'800.00'}],'2026-10','2026-10-11');
  assert.equal(totals.monthly,19950);assert.equal(totals.recorded,9950);assert.equal(totals.active,3);assert.equal(totals.due,2);assert.equal(totals.dueAmount,9950);
});
test('subscription filters and ordering compose without changing source rows',()=>{
  const rows=[row,{...row,id:'cloud',description:'Cloud plan',category:'Cloud Storage',amount:'199.00'}];
  assert.equal(filterRecurring(rows,{search:'STUDENT',category:'Cloud Storage',status:'due'},'2026-10-11')[0].id,'cloud');
  assert.equal(filterRecurring(rows,{order:'cost'},'2026-10-11')[0].id,'cloud');
  assert.equal(rows[0].id,'r1');
  assert.equal(filterRecurring(rows,{status:'active'},'2026-10-11').length,2);
});
test('each history bar reads exactly that month’s saved budget and expense total',()=>{
  const state={transactions:[{date:'2026-08-01',amount:'200.00',type:'expense',method:'UPI'},{date:'2026-09-01',amount:'900.00',type:'expense',method:'Card'}],budgets:[{month:'2026-08',category:'Overall',amount:'1000.00'},{month:'2026-09',category:'Overall',amount:'500.00'},{month:'2026-08',category:'Music',amount:'99.00'}],inbox:[]};
  const history=historyMonths(state,2026);assert.equal(history.length,12);
  assert.equal(history[7].budget,100000);assert.equal(history[7].spent,20000);assert.equal(history[8].remaining,-40000);assert.equal(history[9].hasBudget,false);
});
test('recurring ledger source filter composes with dates and categories',()=>{
  const rows=[{date:'2026-10-01',description:'Music',category:'Music',source:'recurring'}, {date:'2026-10-01',description:'Music',category:'Music',source:'manual'}];
  assert.equal(filterRows(rows,{range:'selected',source:'recurring',category:'Music'},'2026-10','2026-10-11').length,1);
});
test('subscription categories and merchant suggestions are available throughout the ledger',()=>{
  for(const name of ['Subscriptions','Streaming','Music','Software','Cloud Storage','Fitness','Memberships']) assert.ok(categories.some(c=>c.name===name));
  assert.equal(suggest('Netflix Premium'),'Streaming');assert.equal(suggest('Spotify student'),'Music');assert.equal(suggest('iCloud storage'),'Cloud Storage');assert.equal(suggest('Adobe Creative Cloud'),'Software');
});
