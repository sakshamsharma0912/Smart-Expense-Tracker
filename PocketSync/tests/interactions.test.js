/** Controller tests use a small DOM harness; they are not real-browser visual tests. */
import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import * as logic from '../src/main/resources/static/logic.js';
import * as presentation from '../src/main/resources/static/presentation.js';
import * as pocket from '../src/main/resources/static/pocket.js';
class Element {
  innerHTML='';textContent='';value='';open=false;isConnected=true;dataset={};
  classList={toggle(){},contains(){return false;}};
  children=new Map();
  querySelector(key){if(!this.children.has(key))this.children.set(key,new Element());return this.children.get(key);}
  querySelectorAll(){return [];}
  setAttribute(){}removeAttribute(){}addEventListener(){}append(){}remove(){}focus(){this.focused=true;}close(){this.open=false;}showModal(){this.open=true;}click(){}
}
function fixture(){return {profile:{id:'alice',name:'Alice Mehta',email:'alice@example.com',role:'USER',share:false,createdAt:'2026-01-01T00:00:00Z'},viewer:{id:'alice',name:'Alice Mehta',role:'USER',readOnly:false},transactions:[{id:'t1',date:'2026-10-01',description:'Music plan',category:'Music',amount:'99.50',method:'Card',type:'expense',notes:'',source:'recurring',inboxId:'',taxAmount:'10.00'}],budgets:[{id:'b8',month:'2026-08',category:'Overall',amount:'8000.00'},{id:'b10',month:'2026-10',category:'Overall',amount:'12000.00'}],recurring:[{id:'r1',description:'Music plan',plan:'Student',category:'Music',amount:'99.50',frequency:'monthly',startDate:'2026-10-01',nextDate:'2026-10-01',endDate:'',active:true,autoPost:false,type:'expense',method:'Card',notes:'',taxAmount:'10.00'}],inbox:[],audit:[],integration:{live:false,adapterConfigured:false,allowed:false},adminName:'Owner'};}
function harness(){
  const root=new Element(),modal=new Element(),nodes=new Map([['#app',root],['#modal',modal]]),listeners={},requests=[],answers=new Map();
  const document={hidden:false,activeElement:null,documentElement:{style:{setProperty(){}}},querySelector(key){if(!nodes.has(key))nodes.set(key,new Element());return nodes.get(key);},createElement(){return new Element();},addEventListener(name,handler){listeners[name]=handler;}};
  const location={pathname:'/',hash:''};const winListeners={};
  const context=vm.createContext({...logic,...presentation,...pocket,console,Headers,Response,Blob,URLSearchParams,structuredClone,Date,
    URL:{createObjectURL(){return 'blob:test';},revokeObjectURL(){}},document,location,navigator:{},localStorage:{getItem(){return null;},setItem(){}},history:{pushState(a,b,path){location.hash=path.slice(path.indexOf('#'));},replaceState(a,b,path){location.hash=path.includes('#')?path.slice(path.indexOf('#')):'';}},window:{scrollTo(){},addEventListener(n,h){winListeners[n]=h;}},setTimeout(){return 0;},setInterval(){return 0;},
    FormData:class extends Map{constructor(form){super(Object.entries(form.fields||{}));}},
    fetch:async (path,opts)=>{requests.push({path,method:opts.method||'GET',body:opts.body?.toString()});const value=answers.get(path)||fixture();return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});}
  });
  const source=fs.readFileSync(new URL('../src/main/resources/static/app.js',import.meta.url),'utf8').replace(/^import\b[\s\S]*?from "[^\"]+";\s*/gm,'').replace(/\ninit\(\);\s*$/,'');
  vm.runInContext(source,context);context.initial=fixture();vm.runInContext("state=initial;month='2026-10';page='overview';render();",context);
  const evaluate=(code)=>vm.runInContext(code,context);
  const action=(name,dataset={})=>evaluate('perform')(name,{dataset,disabled:false});
  return {root,modal,context,evaluate,action,listeners,requests,answers,winListeners};
}
test('top profile control opens the actual profile view and its save form',async()=>{
  const h=harness();assert.match(h.root.innerHTML,/class="top-profile" data-page="profile"/);
  await h.listeners.click({target:{closest(){return {dataset:{page:'profile'},disabled:false};}},preventDefault(){}});
  assert.equal(h.evaluate('page'),'profile');assert.match(h.root.innerHTML,/data-form="profile"/);assert.match(h.root.innerHTML,/data-form="password"/);assert.match(h.context.location.hash,/page=profile/);
});
test('a graph month opens historical budgets without overwriting other months',async()=>{
  const h=harness();assert.equal((h.root.innerHTML.match(/class="history-month /g)||[]).length,12);
  await h.action('history-month',{month:'2026-08'});assert.equal(h.evaluate('page'),'budgets');assert.equal(h.evaluate('month'),'2026-08');assert.match(h.root.innerHTML,/₹8,000/);assert.equal(h.requests.length,0);
  await h.action('month-step',{step:'1'});assert.equal(h.evaluate('month'),'2026-09');assert.match(h.root.innerHTML,/Not set/);
});
test('subscription dialogs record, pause, edit and remove using live endpoints',async()=>{
  const h=harness();await h.action('recurring-add');assert.ok(h.modal.open);assert.match(h.modal.innerHTML,/data-form="recurring"/);assert.match(h.modal.innerHTML,/name="autoPost"/);
  await h.action('recurring-record',{id:'r1',due:'2026-10-01'});assert.deepEqual(h.requests.at(-1),{path:'/api/recurring/r1/record',method:'POST',body:'dueDate=2026-10-01'});
  await h.action('recurring-status',{id:'r1',active:'false'});assert.equal(h.requests.at(-1).path,'/api/recurring/r1/status');assert.equal(h.requests.at(-1).body,'active=false');
  await h.action('recurring-edit',{id:'r1'});assert.match(h.modal.innerHTML,/Edit recurring schedule/);
  await h.action('recurring-remove',{id:'r1'});assert.match(h.modal.innerHTML,/data-form="recurring-delete"/);
  await h.evaluate('submit')({dataset:{form:'recurring-delete'},fields:{},querySelectorAll(){return [];}});assert.equal(h.requests.at(-1).path,'/api/recurring/r1');assert.equal(h.requests.at(-1).method,'DELETE');
});
test('subscription form submits all persisted schedule fields',async()=>{
  const h=harness();await h.action('recurring-add');
  await h.evaluate('submit')({dataset:{form:'recurring'},fields:{description:'Cloud backup',plan:'Personal',category:'Cloud Storage',amount:'150.00',type:'expense',method:'Card',frequency:'yearly',startDate:'2026-11-01',endDate:'',notes:'',taxAmount:'0',autoPost:'false'},querySelectorAll(){return [];}});
  assert.equal(h.requests.at(-1).path,'/api/recurring');assert.equal(h.requests.at(-1).method,'POST');assert.match(h.requests.at(-1).body,/category=Cloud\+Storage/);assert.ok(!h.modal.open);
});
test('calendar dates open details and profile saves to the existing account endpoint',async()=>{
  const h=harness();await h.evaluate('navigate')('calendar');assert.match(h.root.innerHTML,/class="calendar-day/);
  await h.action('calendar-day',{date:'2026-10-01'});assert.match(h.modal.innerHTML,/Music plan/);assert.match(h.modal.innerHTML,/data-action="recurring-view"/);
  await h.evaluate('navigate')('profile');await h.evaluate('submit')({dataset:{form:'profile'},fields:{name:'Alice Updated',share:'false'},querySelectorAll(){return [];}});assert.equal(h.requests.at(-1).path,'/api/profile');assert.equal(h.requests.at(-1).method,'PUT');
});
test('transaction details and Make recurring preserve source values and advance the first date',async()=>{
  const h=harness();await h.action('transaction-view',{id:'t1'});assert.match(h.modal.innerHTML,/Make recurring/);
  await h.action('recurring-from',{id:'t1'});assert.match(h.modal.innerHTML,/value="99.50"/);assert.match(h.modal.innerHTML,/value="2026-11-01"/);
});
test('category, notification and recurring-ledger shortcuts open filtered data',async()=>{
  const h=harness();await h.action('category-ledger',{category:'Music'});assert.equal(h.evaluate('page'),'transactions');assert.equal(h.evaluate('filters.category'),'Music');
  await h.action('due-subscriptions');assert.equal(h.evaluate('page'),'subscriptions');assert.equal(h.evaluate('subscriptionFilters.status'),'due');
  await h.action('recurring-ledger');assert.equal(h.evaluate('filters.source'),'recurring');assert.equal(h.evaluate('filteredTransactions().length'),1);
});
test('shared views stay read-only and profile returns to the signed-in user',async()=>{
  const h=harness();h.evaluate("state.viewer={id:'admin',name:'Owner',role:'ADMIN',readOnly:true};render();");
  assert.doesNotMatch(h.root.innerHTML,/data-action="recurring-add"/);await assert.rejects(h.action('recurring-edit',{id:'r1'}),/read-only/);
  await h.evaluate('navigate')('profile');assert.equal(h.requests.at(-1).path,'/api/state');assert.equal(h.evaluate('state.viewer.readOnly'),false);assert.equal(h.evaluate('page'),'profile');
});
test('every exposed action and navigation target resolves, including empty views',()=>{
  const h=harness(),source=fs.readFileSync(new URL('../src/main/resources/static/app.js',import.meta.url),'utf8');
  for(const page of ['overview','transactions','inbox','budgets','subscriptions','calendar','reports','imports','settings','profile']){
    h.evaluate(`page='${page}';render();`);
    assert.doesNotMatch(h.root.innerHTML,/undefined|NaN|href="#"/);
    for(const [,action] of h.root.innerHTML.matchAll(/data-action="([^"]+)"/g)) assert.ok(source.includes(`action === "${action}"`)||source.includes(`action==='${action}'`),`Missing handler: ${action}`);
    for(const [,target] of h.root.innerHTML.matchAll(/data-page="([^"]+)"/g)) assert.ok(h.evaluate(`Object.hasOwn(labels,'${target}')`),`Missing page: ${target}`);
  }
  h.evaluate("state.transactions=[];state.budgets=[];state.recurring=[];page='overview';render();");assert.doesNotMatch(h.root.innerHTML,/undefined|NaN/);assert.match(h.root.innerHTML,/No recurring schedules/);
});
test('keyboard search and browser back navigation are wired',async()=>{
  const h=harness();await h.evaluate('navigate')('profile');h.context.location.hash='#page=budgets&month=2026-08';await h.winListeners.popstate();assert.equal(h.evaluate('page'),'budgets');assert.equal(h.evaluate('month'),'2026-08');
  h.listeners.keydown({ctrlKey:true,key:'k',preventDefault(){},target:{}});await new Promise(r=>setImmediate(r));assert.equal(h.evaluate('page'),'transactions');
});
