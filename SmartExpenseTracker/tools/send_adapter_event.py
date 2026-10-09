"""Send one explicitly selected test entry to the local Java adapter.
Reads EXPENSE_ADAPTER_SECRET from the environment. Does not connect to a bank.
Requires an opted-in account. Changes that account's inbox.
"""
import argparse,datetime,hashlib,hmac,json,os,sys,time,urllib.error,urllib.parse,urllib.request,uuid
p=argparse.ArgumentParser(description=__doc__)
p.add_argument('--user-id',required=True);p.add_argument('--reference',required=True)
p.add_argument('--description',required=True);p.add_argument('--amount',required=True)
p.add_argument('--account',required=True);p.add_argument('--port',type=int,default=8080)
p.add_argument('--date',default=datetime.date.today().isoformat())
p.add_argument('--direction',choices=['DEBIT','CREDIT'],default='DEBIT')
p.add_argument('--method',choices=['Cash','UPI','Card','Bank','Other'],default='UPI')
a=p.parse_args();secret=os.environ.get('EXPENSE_ADAPTER_SECRET','')
if len(secret)<32:p.error('Set EXPENSE_ADAPTER_SECRET to the same 32+ character secret used by Java.')
try:uuid.UUID(a.user_id)
except ValueError:p.error('--user-id must be the account UUID displayed in Settings.')
if not 1024<=a.port<=65535:p.error('Choose a port from 1024 to 65535.')
fields={'userId':a.user_id,'transaction_id':a.reference,'description':a.description,'amount':a.amount,'account':a.account,'date':a.date,'direction':a.direction,'method':a.method}
body=urllib.parse.urlencode(fields).encode();stamp=str(int(time.time()))
sig=hmac.new(secret.encode(),stamp.encode()+b'.'+body,hashlib.sha256).hexdigest()
req=urllib.request.Request('http://127.0.0.1:'+str(a.port)+'/api/integrations/transactions',data=body,method='POST',headers={'Content-Type':'application/x-www-form-urlencoded;charset=utf-8','X-Event-Timestamp':stamp,'X-Event-Signature':sig})
try:
    with urllib.request.build_opener(urllib.request.ProxyHandler({})).open(req,timeout=15) as response:
        print('HTTP',response.status);print(json.dumps(json.load(response),indent=2))
except urllib.error.HTTPError as e:
    print('HTTP',e.code);print(e.read().decode());sys.exit(1)
except urllib.error.URLError:
    print('Could not reach the local Java server. Start it first and check --port.');sys.exit(1)
