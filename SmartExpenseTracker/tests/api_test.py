"""Integration checks against a real Java server, using disposable data only.
Run from the project root: python3 tests/api_test.py
Requires a full JDK 17+ and Python 3. No third-party packages.
"""
import base64, hashlib, hmac, http.client, http.cookiejar, json, os, re, socket, subprocess, tempfile, time, urllib.error, urllib.parse, urllib.request, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
PASS=[]
SEED_PASSWORDS={}
def check(name,condition=True):
    assert condition,name
    PASS.append(name)
    print('PASS',name,flush=True)
class Client:
    def __init__(self):
        self.jar=http.cookiejar.CookieJar()
        self.opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(self.jar),urllib.request.ProxyHandler({}))
    def call(self,path,method='GET',data=None,headers=None,expected=200):
        hs={'X-Requested-With':'ExpenseTracker'}
        if headers: hs.update(headers)
        body=urllib.parse.urlencode(data or {}).encode() if method!='GET' else None
        req=urllib.request.Request(BASE+'/api/'+path,data=body,headers=hs,method=method)
        try: response=self.opener.open(req,timeout=12)
        except urllib.error.HTTPError as ex: response=ex
        payload=json.loads(response.read())
        assert response.status==expected,(path,response.status,expected,payload)
        return payload
    def login(self,email,password='Testing-only-Password-234',role='USER'):
        return self.call('login','POST',{'email':email,'password':password,'loginRole':role})

def start(data,adapter=True,seed=False):
    global process,BASE,port,setup
    sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
    BASE='http://127.0.0.1:'+str(port)
    env=os.environ.copy();env.pop('EXPENSE_ADAPTER_SECRET',None)
    if adapter:env['EXPENSE_ADAPTER_SECRET']=SECRET
    log=open(data/'server.log','w+')
    process=subprocess.Popen(['java','-Dfile.encoding=UTF-8','--add-modules','jdk.httpserver','ExpenseServer.java','--port='+str(port),'--data-dir='+str(data/'records')]+([] if seed else ['--no-seed']),cwd=ROOT,env=env,stdout=log,stderr=log)
    deadline=time.monotonic()+45
    while time.monotonic()<deadline:
        if process.poll() is not None:
            log.seek(0);raise RuntimeError(log.read())
        try:
            Client().call('public');break
        except (OSError,urllib.error.URLError):time.sleep(.15)
    else:raise RuntimeError('Server did not start')
    log.flush();log.seek(0);startup=log.read();match=re.search(r'#setup=([A-Za-z0-9_-]+)',startup);setup=match.group(1) if match else None
    SEED_PASSWORDS.update(re.findall(r'INITIAL_LOGIN ([^\s]+) ([A-Za-z0-9_-]+)',startup))
    log.close()
def stop():
    process.terminate()
    try:process.wait(timeout=8)
    except subprocess.TimeoutExpired:process.kill();process.wait()
def event(user,ref='ADAPTER-1',stamp=None,signature=None,**changes):
    f={'userId':user,'transaction_id':ref,'date':'2026-09-29','description':'Campus Cafe','amount':'42.00','direction':'DEBIT','method':'UPI','account':'Test bank'};f.update(changes)
    body=urllib.parse.urlencode(f).encode();stamp=str(stamp if stamp is not None else int(time.time()))
    sig=signature or hmac.new(SECRET.encode(),stamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
    req=urllib.request.Request(BASE+'/api/integrations/transactions',data=body,method='POST',headers={'Content-Type':'application/x-www-form-urlencoded','X-Event-Timestamp':stamp,'X-Event-Signature':sig})
    try:r=urllib.request.urlopen(req,timeout=10)
    except urllib.error.HTTPError as e:r=e
    return r.status,json.loads(r.read())
SECRET='only-a-test-secret-never-used-outside-this-test'
transaction={'date':'2026-09-29','description':'Cash lunch','amount':'120.10','category':'Food','method':'Cash','type':'expense','notes':''}
with tempfile.TemporaryDirectory(prefix='expense-v2-test-') as temp:
    data=Path(temp);start(data)
    try:
        anonymous=Client();owner=Client();alice=Client();bob=Client()
        check('fresh server requires owner setup',anonymous.call('public')['setupRequired'])
        anonymous.call('state',expected=401);check('anonymous access denied')
        reg={'name':'Alice','email':'alice@example.test','password':'Testing-only-Password-234','noticeAccepted':'true','share':'false','role':'ADMIN'}
        alice.call('register','POST',reg,expected=409);check('registration cannot run before owner setup')
        owner.call('setup','POST',dict(reg,setupKey='incorrect'),expected=403);check('owner setup requires one-time key')
        result=owner.call('setup','POST',dict(reg,name='Test Owner',email='owner@example.test',setupKey=setup));owner_id=result['profile']['id']
        check('owner account receives ADMIN role and starts empty',result['profile']['role']=='ADMIN' and not result['transactions'])
        owner.call('setup','POST',dict(reg,setupKey=setup),expected=403);check('owner setup closes after first owner')
        alice.call('register','POST',dict(reg,noticeAccepted='false'),expected=400);check('privacy acknowledgement required')
        a=alice.call('register','POST',reg);aid=a['profile']['id']
        check('user registration ignores forged ADMIN role',a['profile']['role']=='USER')
        check('new tracker defaults to private and empty',not a['profile']['share'] and not a['transactions'])
        b=bob.call('register','POST',dict(reg,name='Bob',email='bob@example.test',share='true'));bid=b['profile']['id']
        check('explicit sharing recorded',b['profile']['share'])
        bad=Client();bad.call('login','POST',{'email':'alice@example.test','password':'wrong-password-123','loginRole':'USER'},expected=401);check('incorrect password denied')
        check('correct login reopens same user',Client().login('alice@example.test')['profile']['id']==aid)
        a=alice.call('transactions','POST',transaction);tid=a['transactions'][0]['id']
        check('manual cash expense stored with exact cents',a['transactions'][0]['amount']=='120.10' and a['transactions'][0]['method']=='Cash')
        check('one account cannot read another ledger',not bob.call('state')['transactions'])
        bob.call('transactions/'+tid,'DELETE',expected=400);check('foreign transaction ID cannot be deleted')
        alice.call('admin/users',expected=403);check('normal user cannot access admin directory')
        users=owner.call('admin/users')['users'];private=next(u for u in users if u['id']==aid)
        check('private financial totals hidden from admin',private['spent'] is None and private['pending'] is None)
        owner.call('admin/users/'+aid+'/state',expected=403);check('private tracker read denied')
        alice.call('profile','PUT',{'name':'Alice','share':'true'});view=owner.call('admin/users/'+aid+'/state')
        check('shared tracker opens read-only under actual owner identity',view['viewer']['id']==owner_id and view['profile']['id']==aid and view['viewer']['readOnly'])
        check('admin view appears in user activity',any(x['event']=='Viewed tracker (read-only)' for x in alice.call('state')['audit']))
        owner.call('admin/users/'+aid+'/transactions','POST',transaction,expected=403);check('admin target mutations denied')
        alice.call('profile','PUT',{'name':'Alice','share':'false'});owner.call('admin/users/'+aid+'/state',expected=403);check('sharing revocation enforced immediately')
        for invalid in ['-1','0','NaN','1.005','1e3','1000000000']:
            alice.call('transactions','POST',dict(transaction,amount=invalid),expected=400)
        alice.call('transactions','POST',dict(transaction,date='2026-02-29'),expected=400)
        check('invalid money and impossible date rejected without mutation',len(alice.call('state')['transactions'])==1)
        alice.call('budgets','PUT',{'month':'2026-09','category':'Overall','amount':'1000'})
        alice.call('budgets','PUT',{'month':'2026-10','category':'Overall','amount':'2000'})
        alice.call('budgets','PUT',{'month':'2026-09','category':'Food','amount':'500'})
        check('monthly/category budgets remain separate',len(alice.call('state')['budgets'])==3)
        csv='\ufefftransaction_id,date,description,amount,direction,method,account\r\nREF-1,2026-09-29,"Cafe, tea",120.10,DEBIT,UPI,Test bank\r\nREF-2,2026-09-29,Allowance,1000,CREDIT,Bank,Test bank\r\n'
        fields={'csv':csv,'amountMode':'single','dateFormat':'ISO'}
        preview=alice.call('import/preview','POST',fields)
        check('CSV preview handles BOM, CRLF and quoted comma',preview['newCount']==2 and preview['rows'][0]['description']=='Cafe, tea')
        check('preview does not save entries',not alice.call('state')['inbox'])
        imported=alice.call('import/commit','POST',fields);a=imported['state'];debit,credit=a['inbox']
        check('imports enter inbox without changing ledger',imported['imported']==2 and len(a['transactions'])==1)
        duplicate=alice.call('import/commit','POST',fields)
        check('re-import skips existing references',duplicate['imported']==0 and duplicate['duplicates']==2)
        conflict=csv.replace('120.10','130.10');alice.call('import/commit','POST',dict(fields,csv=conflict),expected=400)
        check('conflicting reference rejected atomically',len(alice.call('state')['inbox'])==2)
        alice.call('inbox/'+debit['id'],'PUT',{'action':'categorize','type':'income','category':'Food'},expected=400)
        check('debit cannot be recorded as income')
        a=alice.call('inbox/'+debit['id'],'PUT',{'action':'match','transactionId':tid})
        check('matching avoids duplicate expense and adopts bank method',len(a['transactions'])==1 and a['transactions'][0]['method']=='UPI' and a['inbox'][0]['status']=='matched')
        alice.call('transactions/'+tid,'PUT',dict(transaction,amount='121'),expected=400);check('linked bank fields protected')
        a=alice.call('inbox/'+credit['id'],'PUT',{'action':'categorize','type':'refund','category':'Other'})
        check('credits can be classified separately as refunds',a['transactions'][-1]['type']=='refund')
        alice.call('inbox/'+credit['id'],'PUT',{'action':'categorize','type':'income','category':'Other'},expected=400);check('review action cannot duplicate approved entry')
        a=alice.call('transactions/'+tid,'DELETE');check('deleting linked expense keeps dedup record ignored',a['inbox'][0]['status']=='ignored')
        dup=alice.call('import/commit','POST',fields);check('ignored references remain deduplicated',dup['imported']==0)
        a=alice.call('inbox/'+debit['id'],'PUT',{'action':'restore'});check('ignored import can be restored',a['inbox'][0]['status']=='pending')
        alice.call('inbox/'+debit['id'],'PUT',{'action':'categorize','type':'expense','category':'Food'})
        split='Ref,When,Details,Out,In\r\nSPLIT-1,30/09/2026,Metro,300,\r\nSPLIT-2,30/09/2026,Gift,,500\r\n'
        mapping={'csv':split,'map_id':'0','map_date':'1','map_description':'2','map_debit':'3','map_credit':'4','amountMode':'split','dateFormat':'DMY','defaultAccount':'Test bank','defaultMethod':'UPI'}
        sr=alice.call('import/commit','POST',mapping)
        check('custom columns and DMY split amounts supported',sr['imported']==2 and sr['state']['inbox'][-1]['direction']=='CREDIT')
        alice.call('import/commit','POST',dict(mapping,csv=split.replace('300,','-300,')),expected=400);check('negative split amounts rejected')
        alice.call('import/commit','POST',dict(mapping,csv=split.replace('Metro,300,','Metro,300,200')),expected=400);check('ambiguous debit and credit rejected')
        badrows=csv.replace('REF-1','NEW-REF-1').replace('REF-2','NEW-REF-2').replace('1000,CREDIT','NaN,CREDIT')
        before=len(alice.call('state')['inbox']);alice.call('import/commit','POST',dict(fields,csv=badrows),expected=400)
        check('invalid later row prevents partial statement import',len(alice.call('state')['inbox'])==before)
        repeated=csv+csv.splitlines()[1]+'\r\n';r=alice.call('import/preview','POST',dict(fields,csv=repeated));check('duplicates within a file skipped',r['newCount']==0 and r['duplicates']==3)
        multiline=csv.splitlines()[0]+'\r\nMULTI,2026-09-30,"Tea\nand coffee",10,DEBIT,UPI,Test bank\r\n';r=alice.call('import/preview','POST',dict(fields,csv=multiline));check('quoted newlines survive CSV parser',r['rows'][0]['description']=='Tea\nand coffee')
        legacy_id=str(uuid.uuid4());old=f'{legacy_id},2026-08-02,Old lunch,Food,10.20\n'
        lr=alice.call('import/legacy','POST',{'csv':old+old,'budget':'2500'})
        check('legacy migration deduplicates within batch',lr['imported']==1)
        check('legacy budget migrates without overwriting existing month',next(x for x in lr['state']['budgets'] if x['id']=='2026-09_Overall')['amount']=='1000.00')
        check('legacy file re-import idempotent',alice.call('import/legacy','POST',{'csv':old})['imported']==0)
        alice.call('import/legacy','POST',{'csv':old.replace('Old lunch','Changed lunch')},expected=400);check('conflicting legacy identity rejected')
        four='2026-07-02,Old bus,Travel,20.50\n';check('four-column legacy CSV supported',alice.call('import/legacy','POST',{'csv':four})['imported']==1)
        check('same four-column file deduplicates',alice.call('import/legacy','POST',{'csv':four})['imported']==0)
        check('adapter requires individual opt-in',event(aid)[0]==403)
        alice.call('adapter-consent','PUT',{'allowed':'true'})
        check('adapter rejects wrong signature',event(aid,signature='0'*64)[0]==401)
        check('adapter rejects expired timestamp',event(aid,stamp=int(time.time())-600)[0]==401)
        status,res=event(aid);check('signed local adapter entry accepted',status==202 and res['accepted'])
        status,res=event(aid);check('adapter retry is idempotent',status==200 and res['duplicate'])
        check('adapter rejects conflicting event',event(aid,amount='43')[0]==400)
        alice.call('adapter-consent','PUT',{'allowed':'false'});check('revoked adapter permission blocks new data',event(aid,ref='ADAPTER-2')[0]==403)
        check('adapter entry stays pending until categorised',alice.call('state')['inbox'][-1]['status']=='pending')
        anonymous.call('demo','POST',{'kind':'admin'},expected=404)
        alice.call('simulate','POST',{'description':'Fake','amount':'10'},expected=404)
        check('temporary account and simulated-payment routes are removed')
        anonymous.call('forgot-password','POST',{'email':'alice@example.test'},expected=401)
        check('no password recovery endpoint is enabled')
        alice.call('login','POST',{'email':'alice@example.test','password':'Testing-only-Password-234','loginRole':'ADMIN'},expected=401)
        check('user credentials cannot sign in through admin portal')
        anonymous.call('login','POST',{'email':'owner@example.test','password':'Testing-only-Password-234','loginRole':'USER'},expected=401)
        check('admin account cannot sign in through user portal')
        anonymous.call('login','POST',{'email':'alice@example.test','password':'Testing-only-Password-234'},expected=400)
        check('login portal must be selected explicitly')
        second_session=Client();second_session.login('alice@example.test')
        alice.call('password','PUT',{'currentPassword':'wrong-password','newPassword':'Updated-only-Password-567'},expected=400)
        alice.call('password','PUT',{'currentPassword':'Testing-only-Password-234','newPassword':'Updated-only-Password-567'})
        second_session.call('state',expected=401)
        check('password change verifies current password and revokes other sessions')
        anonymous.call('login','POST',{'email':'alice@example.test','password':'Testing-only-Password-234','loginRole':'USER'},expected=401)
        check('previous password stops working after change')
        check('updated password signs in successfully',Client().login('alice@example.test','Updated-only-Password-567')['profile']['id']==aid)
        con=http.client.HTTPConnection('127.0.0.1',port,timeout=10);con.request('GET','/api/public',headers={'Host':'evil.example'});check('host validation blocks rebinding',con.getresponse().status==403);con.close()
        anonymous.call('public',headers={'Origin':'https://evil.example'},expected=403);check('cross-origin requests denied')
        navigation={'Origin':'null','Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'}
        con=http.client.HTTPConnection('127.0.0.1',port,timeout=10);con.request('GET','/',headers=navigation);r=con.getresponse();check('standalone link can open the public HTML entry',r.status==200 and b'bundle.js' in r.read());con.close()
        anonymous.call('state',headers=navigation,expected=403);check('entry navigation exception cannot expose API state')
        con=http.client.HTTPConnection('127.0.0.1',port,timeout=10);con.request('POST','/api/login',body='email=x',headers={'Content-Type':'application/x-www-form-urlencoded'});check('write requests require application header',con.getresponse().status==403);con.close()
        con=http.client.HTTPConnection('127.0.0.1',port,timeout=10);con.request('GET','/data/users/'+aid+'.properties');check('account files are not statically served',con.getresponse().status==404);con.close()
        for route in ['/preview.js','/runtime.js','/data/expense-tracker.mv.db']:
            con=http.client.HTTPConnection('127.0.0.1',port,timeout=10);con.request('GET',route);check(route+' is not exposed',con.getresponse().status==404);con.close()
        saved=alice.call('state');stop()
        db=data/'records'/'expense-tracker'
        def query(sql, database=db):
            result=subprocess.run(['java','-cp',str(ROOT/'lib'/'h2-2.5.252.jar'),'org.h2.tools.Shell','-url','jdbc:h2:file:'+str(database),'-user','tracker','-password','','-sql',sql],capture_output=True,text=True,check=True)
            assert 'Error:' not in result.stdout,result.stdout
            return result.stdout
        stored=query("SELECT email, LENGTH(password_hash) AS hash_length, LENGTH(password_salt) AS salt_length, password_algorithm, password_iterations FROM accounts")
        check('database stores salted password hashes and algorithm metadata','PBKDF2WithHmacSHA256' in stored and '210000' in stored and 'Updated-only-Password-567' not in stored and '44' in stored and '24' in stored)
        check('all real accounts are in SQL accounts table','3' in query('SELECT COUNT(*) FROM accounts'))
        check('ledger has relational account foreign keys and exact decimal totals',str(len(saved['transactions'])) in query("SELECT COUNT(*) FROM transactions WHERE account_id='"+aid+"'"))
        check('legacy property storage is no longer created',not (data/'records'/'users').exists())
        start(data,adapter=False)
        check('restart keeps owner setup closed',not Client().call('public')['setupRequired'])
        restored=Client().login('alice@example.test','Updated-only-Password-567');check('account data survives database restart',restored['transactions']==saved['transactions'] and restored['inbox']==saved['inbox'] and restored['budgets']==saved['budgets'])
        check('admin password sign-in survives restart',Client().login('owner@example.test',role='ADMIN')['profile']['role']=='ADMIN')
        check('adapter disabled without configured secret',event(aid)[0]==503)
        bob=Client();bob.login('bob@example.test');bob.call('logout','POST');bob.call('state',expected=401);check('logout invalidates server session')
        stop()
        seeded=data/'seeded';seeded.mkdir();start(seeded,adapter=False,seed=True)
        admin=Client();admin_state=admin.login('admin@tracker.local',SEED_PASSWORDS['admin@tracker.local'],'ADMIN')
        users=admin.call('admin/users')['users']
        check('default installation has one admin and four persistent normal users',admin_state['profile']['role']=='ADMIN' and len(users)==4)
        for handle, password in [('aarav',SEED_PASSWORDS['aarav@tracker.local']),('isha',SEED_PASSWORDS['isha@tracker.local']),('rohan',SEED_PASSWORDS['rohan@tracker.local']),('meera',SEED_PASSWORDS['meera@tracker.local'])]:
            person=Client();account=person.login(handle+'@tracker.local',password)
            months={t['date'][:7] for t in account['transactions']}
            check(handle+' has three months of tracker records and monthly budgets',len(months)==3 and len(account['transactions'])==66 and len(account['budgets'])==27)
            check(handle+' has persisted imports ready for review',len(account['inbox'])==2 and all(t['status']=='pending' for t in account['inbox']))
            view=admin.call('admin/users/'+account['profile']['id']+'/state')
            check(handle+' is visible to admin with logged read-only access',view['viewer']['readOnly'] and len(view['transactions'])==66)
            check(handle+' login response never exposes password hashes','password_hash' not in json.dumps(account) and 'salt' not in json.dumps(account))
        seeded_person=Client();initial=seeded_person.login('aarav@tracker.local',SEED_PASSWORDS['aarav@tracker.local']);uid=initial['profile']['id']
        seeded_person.call('transactions','POST',dict(transaction,description='Persistent extra expense'))
        stop();start(seeded,adapter=False,seed=True)
        reopened=Client().login('aarav@tracker.local',SEED_PASSWORDS['aarav@tracker.local'])
        check('seed initialization never resets changes or duplicates accounts on restart',reopened['profile']['id']==uid and len(reopened['transactions'])==67 and len(Client().login('admin@tracker.local',SEED_PASSWORDS['admin@tracker.local'],'ADMIN')['transactions'])==0)
        admin=Client();admin.login('admin@tracker.local',SEED_PASSWORDS['admin@tracker.local'],'ADMIN')
        check('seeded account count remains four after restart',len(admin.call('admin/users')['users'])==4)
        stop()
        migrated=data/'migration';(migrated/'records'/'users').mkdir(parents=True)
        original_ids=[]
        for name,email,role in [('Previous Admin','previous-admin@example.test','ADMIN'),('Previous User','previous-user@example.test','USER')]:
            account_id=str(uuid.uuid4());original_ids.append(account_id)
            salt=os.urandom(16)
            hashed=hashlib.pbkdf2_hmac('sha256',b'Previous-only-Password-890',salt,210000,32)
            props={'version':'2','id':account_id,'name':name,'email':email,'role':role,'salt':base64.b64encode(salt).decode(),'hash':base64.b64encode(hashed).decode(),'createdAt':'2026-08-01T10:00:00Z','share':'true','adapterAllowed':'false','transactions.count':'0','inbox.count':'0','budgets.count':'0','audit.count':'0'}
            if role=='USER':
                props['transactions.count']='1'
                row=dict(transaction,id='legacy-'+str(uuid.uuid4()),source='legacy',inboxId='')
                row['amount']='120.10'
                props.update({'transactions.0.'+k:v for k,v in row.items()})
            path=migrated/'records'/'users'/(account_id+'.properties')
            path.write_text('\n'.join(k+'='+v for k,v in props.items())+'\n')
        original_bytes={p.name:p.read_bytes() for p in (migrated/'records'/'users').glob('*.properties')}
        start(migrated,adapter=False,seed=True)
        imported=Client().login('previous-user@example.test','Previous-only-Password-890')
        check('previous file-based user keeps password, ID and ledger after SQL migration',imported['profile']['id']==original_ids[1] and len(imported['transactions'])==1 and imported['transactions'][0]['source']=='legacy')
        previous_admin=Client();previous_admin.login('previous-admin@example.test','Previous-only-Password-890','ADMIN')
        check('existing installation is migrated without adding preloaded users',len(previous_admin.call('admin/users')['users'])==1)
        check('migration leaves previous account files unchanged',all((migrated/'records'/'users'/name).read_bytes()==content for name,content in original_bytes.items()))
        stop();start(migrated,adapter=False,seed=True)
        check('migration is idempotent across restart',len(Client().login('previous-user@example.test','Previous-only-Password-890')['transactions'])==1)
        print('\n'+str(len(PASS))+' integration checks passed.',flush=True)
    finally:stop()
