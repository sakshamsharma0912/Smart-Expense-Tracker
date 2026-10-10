package com.saksham.expense;

import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class RecurringService {
    static final Set<String> FREQUENCIES=Set.of("weekly","monthly","quarterly","yearly");
    private final WorkspaceService store;
    private final TransactionService ledger;
    private final RecurringRepository recurring;
    private final RecurringOccurrenceRepository occurrences;
    private final Clock clock;
    RecurringService(WorkspaceService store,TransactionService ledger,RecurringRepository recurring,RecurringOccurrenceRepository occurrences,Clock clock) {
        this.store=store;this.ledger=ledger;this.recurring=recurring;this.occurrences=occurrences;this.clock=clock;
    }
    @Transactional
    Map<String,Object> save(User actor,String id,Map<String,String> form) {
        User user=ledger.lock(actor);
        RecurringTransaction r=id==null?new RecurringTransaction():find(id,user);
        String frequency=form.get("frequency");
        if(frequency==null || !FREQUENCIES.contains(frequency)) throw new IllegalArgumentException("Choose weekly, monthly, quarterly or yearly billing.");
        LocalDate start=Validation.date(form.get("startDate"));
        if(start.isBefore(LocalDate.now(clock).minusYears(5))) throw new IllegalArgumentException("First billing date must be within the last five years or in the future.");
        LocalDate end=form.getOrDefault("endDate","").isBlank()?null:Validation.date(form.get("endDate"));
        if(end!=null && end.isBefore(start)) throw new IllegalArgumentException("End date must be on or after first billing.");
        boolean changed=id!=null && (!start.equals(r.startDate)||!frequency.equals(r.frequency));
        if(changed && occurrences.existsByRecurringId(r.id)) throw new IllegalArgumentException("Billing frequency and first billing date are fixed after recording. Create a new schedule to change them.");
        Transaction validated=new Transaction();
        Map<String,String> fields=new HashMap<>(form);fields.put("date",start.toString());
        if(form.get("type")==null || !Set.of("expense","income").contains(form.get("type"))) throw new IllegalArgumentException("Recurring entries must be an expense or income.");
        TransactionService.fill(validated,fields);
        r.user=user;r.description=validated.description;r.amount=validated.amount;r.category=validated.category;
        r.type=validated.type;r.method=validated.method;r.notes=validated.notes;r.taxAmount=validated.taxAmount;
        r.plan=Validation.text(form.get("plan"),"Plan",60,false);
        if(id==null || changed) r.nextDate=start;
        r.startDate=start;r.frequency=frequency;r.endDate=end;
        r.autoPost=flag(form,"autoPost");
        if(id==null) r.active=true;
        recurring.save(r);store.audit(user,user.name,id==null?"Created recurring schedule: "+r.description:"Updated recurring schedule: "+r.description);
        return store.state(user,user);
    }
    private static boolean flag(Map<String,String> form,String name) {
        String value=form.getOrDefault(name,"false");
        if(!Set.of("true","false").contains(value)) throw new IllegalArgumentException("Invalid schedule option.");
        return value.equals("true");
    }
    @Transactional
    Map<String,Object> status(User actor,String id,Map<String,String> form) {
        User user=ledger.lock(actor);RecurringTransaction r=find(id,user);
        r.active=flag(form,"active");
        if(r.active) {
            // Paused periods are skipped, rather than billed retrospectively.
            LocalDate today=LocalDate.now(clock);
            while(r.nextDate.isBefore(today)) r.nextDate=nextAfter(r.startDate,r.nextDate,r.frequency);
        }
        store.audit(user,user.name,(r.active?"Resumed":"Paused")+" recurring schedule: "+r.description);
        return store.state(user,user);
    }
    @Transactional
    Map<String,Object> remove(User actor,String id) {
        User user=ledger.lock(actor);RecurringTransaction r=find(id,user);r.archived=true;r.active=false;
        store.audit(user,user.name,"Removed recurring schedule: "+r.description+"; recorded transactions retained");
        return store.state(user,user);
    }
    @Transactional
    Map<String,Object> record(User actor,String id,String expectedDate) {
        User user=ledger.lock(actor);RecurringTransaction r=find(id,user);
        if(!r.nextDate.equals(Validation.date(expectedDate))) throw new IllegalArgumentException("This billing date has already changed. Refresh the schedule.");
        if(!due(r,LocalDate.now(clock))) throw new IllegalArgumentException("Only an active, due billing can be recorded.");
        post(user,r);store.audit(user,user.name,"Recorded recurring billing: "+r.description);
        return store.state(user,user);
    }
    @Transactional
    int sync(User actor) {
        User user=ledger.lock(actor);LocalDate today=LocalDate.now(clock);int count=0;
        for(RecurringTransaction r:recurring.findByUserIdAndArchivedFalseOrderByNextDateAsc(user.id)) {
            while(r.autoPost && due(r,today) && count<366) { post(user,r);count++; }
        }
        if(count>0) store.audit(user,user.name,"Recorded "+count+" due recurring entries automatically");
        return count;
    }
    private RecurringTransaction find(String id,User user) {
        return recurring.findByIdAndUserIdAndArchivedFalse(id,user.id).orElseThrow(Validation::missing);
    }
    static boolean due(RecurringTransaction r,LocalDate today) {
        return r.active && !r.archived && !r.nextDate.isAfter(today) && (r.endDate==null||!r.nextDate.isAfter(r.endDate));
    }
    private void post(User user,RecurringTransaction r) {
        LocalDate due=r.nextDate;
        if(!occurrences.existsByRecurringIdAndDueDate(r.id,due)) {
            Transaction t=new Transaction();t.user=user;t.date=due;t.description=r.description;
            t.amount=r.amount;t.category=r.category;t.type=r.type;t.method=r.method;t.taxAmount=r.taxAmount;
            t.notes=r.notes;t.source="recurring";
            t.importKey=Validation.hash("recurring:"+r.id+":"+due);
            store.transactions().save(t);
            RecurringOccurrence occurrence=new RecurringOccurrence();occurrence.recurring=r;occurrence.dueDate=due;occurrence.transactionId=t.id;
            occurrences.save(occurrence);
        }
        r.nextDate=nextAfter(r.startDate,due,r.frequency);
    }
    static LocalDate nextAfter(LocalDate anchor,LocalDate due,String frequency) {
        if(frequency.equals("weekly")) return due.plusWeeks(1);
        int step=switch(frequency) {case "monthly"->1;case "quarterly"->3;case "yearly"->12;default->throw new IllegalArgumentException("Invalid frequency.");};
        YearMonth next=YearMonth.from(due).plusMonths(step);
        return next.atDay(Math.min(anchor.getDayOfMonth(),next.lengthOfMonth()));
    }
    static Map<String,Object> view(RecurringTransaction r) {
        return WorkspaceService.data("id",r.id,"description",r.description,"plan",r.plan,"category",r.category,
            "amount",r.amount.toPlainString(),"type",r.type,"method",r.method,"frequency",r.frequency,
            "startDate",r.startDate.toString(),"nextDate",r.nextDate.toString(),"endDate",r.endDate==null?"":r.endDate.toString(),
            "active",r.active,"autoPost",r.autoPost,"notes",r.notes,"taxAmount",r.taxAmount.toPlainString());
    }
}
