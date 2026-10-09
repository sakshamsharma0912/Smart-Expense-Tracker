"""Validate generated markup from the app's render functions, not screenshots."""
import json,sys
from html.parser import HTMLParser
class Parser(HTMLParser):
    def __init__(self):
        super().__init__();self.ids=[];self.labels=[];self.buttons=[];self.inputs=[];self.tags=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);self.tags.append(tag)
        if 'id' in a:self.ids.append(a['id'])
        if tag=='label' and 'for' in a:self.labels.append(a['for'])
        if tag=='button':self.buttons.append(a)
        if tag in ['input','textarea','select']:self.inputs.append(a)
for case in json.load(open(sys.argv[1])):
    p=Parser();p.feed(case['html']);name=case['name']
    assert len(p.ids)==len(set(p.ids)),(name,'duplicate IDs')
    assert all(i in p.ids for i in p.labels),(name,'orphan label')
    assert all(b.get('type') in ['button','submit'] for b in p.buttons),(name,'implicit button submission')
    assert all(b.get('type')=='button' for b in p.buttons if b.get('data-action')),(name,'action submits a form')
    assert 'script' not in p.tags,(name,'unexpected generated script tag')
print('PASS generated markup: unique IDs, label targets, explicit button types and no injected scripts')
