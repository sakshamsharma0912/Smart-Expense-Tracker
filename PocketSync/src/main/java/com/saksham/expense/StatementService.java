package com.saksham.expense;

import java.util.*;
import org.apache.commons.csv.CSVRecord;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class StatementService {
    private final WorkspaceService store;
    private final TransactionService transactions;
    private final StatementParser parser;
    StatementService(WorkspaceService store,TransactionService transactions,StatementParser parser) {
        this.store=store;this.transactions=transactions;this.parser=parser;
    }
    record Batch(List<StatementParser.Incoming> rows,int duplicates) {}
    Batch prepare(User user,String csv,Map<String,String> options) {
        List<StatementParser.Incoming> parsed=parser.parse(csv,options);
        Map<String,StatementParser.Incoming> seen=new HashMap<>();
        for(InboxEntry entry:store.inbox().findByUserIdOrderByReceivedAtDesc(user.id))
            seen.put(entry.key,new StatementParser.Incoming(entry.key,entry.reference,entry.account,entry.date,
                entry.description,entry.amount,entry.direction,entry.method,entry.suggested,entry.taxAmount));
        List<StatementParser.Incoming> fresh=new ArrayList<>();int duplicates=0;
        for(StatementParser.Incoming row:parsed) {
            StatementParser.Incoming old=seen.get(row.key());
            if(old!=null) {
                if(!same(old,row)) throw new IllegalArgumentException("Reference "+row.reference()+" already exists with different details.");
                duplicates++;
            } else { seen.put(row.key(),row);fresh.add(row); }
        }
        return new Batch(fresh,duplicates);
    }
    static boolean same(StatementParser.Incoming a,StatementParser.Incoming b) {
        return a.account().equals(b.account())&&a.reference().equals(b.reference())&&a.date().equals(b.date())&&
            a.description().equals(b.description())&&a.direction().equals(b.direction())&&a.method().equals(b.method())&&
            a.amount().compareTo(b.amount())==0&&a.taxAmount().compareTo(b.taxAmount())==0;
    }
    @Transactional(readOnly=true)
    Map<String,Object> preview(User user,Map<String,String> options) {
        Batch batch=prepare(user,options.get("csv"),options);
        return WorkspaceService.data("rows",batch.rows.stream().map(row->WorkspaceService.incoming(entry(user,row))).toList(),
            "duplicates",batch.duplicates,"newCount",batch.rows.size());
    }
    @Transactional
    Map<String,Object> commit(User actor,String csv,Map<String,String> options,boolean automatic) {
        User user=transactions.lock(actor);Batch batch=prepare(user,csv,options);
        for(StatementParser.Incoming row:batch.rows) {
            InboxEntry incoming=entry(user,row);
            if(automatic) {
                Transaction t=new Transaction();t.user=user;t.date=row.date();t.description=row.description();
                t.amount=row.amount();t.taxAmount=row.taxAmount();t.category=row.category();t.method=row.method();
                t.type=StatementParser.smartType(row.direction(),row.description());
                t.source="auto-statement";t.inboxId=incoming.id;t.importKey=row.key();
                t.notes="Automatically categorized from statement; review the category and transaction type.";
                store.transactions().save(t);incoming.ledgerId=t.id;incoming.status="categorized";incoming.source="auto-statement";
            }
            store.inbox().save(incoming);
        }
        store.audit(user,user.name,"Imported "+batch.rows.size()+" statement entries"+(automatic?" with automatic categories":" into review inbox"));
        return WorkspaceService.data("state",store.state(user,user),"imported",batch.rows.size(),"duplicates",batch.duplicates);
    }
    static InboxEntry entry(User user,StatementParser.Incoming row) {
        InboxEntry i=new InboxEntry();i.user=user;i.key=row.key();i.reference=row.reference();i.account=row.account();
        i.date=row.date();i.description=row.description();i.amount=row.amount();i.direction=row.direction();
        i.method=row.method();i.suggested=row.category();i.taxAmount=row.taxAmount();return i;
    }
    @Transactional
    Map<String,Object> legacy(User actor,Map<String,String> options) {
        User user=transactions.lock(actor);String input=options.get("csv");
        List<CSVRecord> rows=parser.records(input);
        if(rows.isEmpty()||rows.size()>StatementParser.MAX_ROWS) throw new IllegalArgumentException("Use 1–5,000 legacy rows.");
        Map<String,Transaction> existing=new HashMap<>();
        for(Transaction t:store.transactions().findByUserIdOrderByDateDescCreatedAtDesc(user.id))
            if(t.importKey!=null) existing.put(t.importKey,t);
        List<Transaction> pending=new ArrayList<>();Set<String> months=new HashSet<>();int rowNumber=0;
        for(CSVRecord row:rows) {
            rowNumber++;
            if(row.size()!=4&&row.size()!=5) throw new IllegalArgumentException("Legacy row "+rowNumber+" needs 4 or 5 columns without a header.");
            int offset=row.size()==5?1:0;
            String originalKey=offset==1?"legacy-"+UUID.fromString(row.get(0)):"legacy-"+Validation.hash(input+"_"+rowNumber);
            String key=Validation.hash(originalKey);
            Transaction t=new Transaction();t.user=user;t.importKey=key;t.source="legacy";
            TransactionService.fill(t,Map.of("date",row.get(offset),"description",row.get(offset+1),"category",row.get(offset+2),
                "amount",row.get(offset+3),"method","Other","type","expense","notes","Imported from the original tracker; payment method was not recorded."));
            Transaction old=existing.get(key);
            if(old!=null) {
                if(!old.date.equals(t.date)||!old.description.equals(t.description)||!old.category.equals(t.category)||old.amount.compareTo(t.amount)!=0)
                    throw new IllegalArgumentException("A legacy reference has conflicting data.");
            } else { pending.add(t);existing.put(key,t); }
            months.add(t.date.toString().substring(0,7));
        }
        String limit=options.getOrDefault("budget","").trim();
        java.math.BigDecimal value=limit.isEmpty()?null:Validation.money(limit,false);
        store.transactions().saveAll(pending);
        if(value!=null) {
            months.add(java.time.YearMonth.now(java.time.ZoneId.of("Asia/Kolkata")).toString());
            for(String month:months) if(store.budgets().findByUserIdAndMonthAndCategory(user.id,month,"Overall").isEmpty()) {
                Budget b=new Budget();b.user=user;b.month=month;b.category="Overall";b.amount=value;store.budgets().save(b);
            }
        }
        store.audit(user,user.name,"Migrated "+pending.size()+" legacy expenses");
        return WorkspaceService.data("state",store.state(user,user),"imported",pending.size());
    }
}
