package com.saksham.expense;

import java.math.BigDecimal;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class TransactionService {
    private final WorkspaceService store;
    TransactionService(WorkspaceService store) { this.store=store; }
    User lock(User actor) {
        User locked=AuthService.resolved(store.users().lockById(actor.id).orElseThrow(Validation::missing));
        if(!locked.active||locked.tokenVersion!=actor.tokenVersion) throw AuthService.unauthorized();
        return locked;
    }
    @Transactional
    Map<String,Object> save(User actor,String id,Map<String,String> form) {
        User user=lock(actor);
        Transaction transaction=id==null?new Transaction():store.transactions().findByIdAndUserId(id,user.id).orElseThrow(Validation::missing);
        transaction.user=user;
        if(!transaction.inboxId.isEmpty()) {
            if(!transaction.amount.equals(Validation.money(form.get("amount"),false)) ||
                !transaction.date.equals(Validation.date(form.get("date"))) ||
                !transaction.method.equals(form.get("method")))
                throw new IllegalArgumentException("Amount, date and payment method are fixed for linked imports.");
            InboxEntry entry=store.inbox().findByIdAndUserId(transaction.inboxId,user.id).orElseThrow(Validation::missing);
            direction(entry.direction,form.get("type"));
        }
        fill(transaction,form);
        store.transactions().save(transaction);store.audit(user,user.name,id==null?"Added transaction":"Updated transaction");
        return store.state(user,user);
    }
    static void fill(Transaction transaction,Map<String,String> form) {
        transaction.date=Validation.date(form.get("date"));
        transaction.description=Validation.text(form.get("description"),"Description",100,true);
        transaction.amount=Validation.money(form.get("amount"),false);
        transaction.category=form.get("category");transaction.method=form.get("method");transaction.type=form.get("type");
        if(transaction.category==null || transaction.method==null || transaction.type==null || !Validation.CATEGORIES.contains(transaction.category) || !Validation.METHODS.contains(transaction.method) ||
            !Validation.TYPES.contains(transaction.type)) throw new IllegalArgumentException("Check category, type and payment method.");
        transaction.notes=Validation.text(form.get("notes"),"Notes",500,false);
        transaction.taxAmount=Validation.money(form.getOrDefault("taxAmount","0"),true);
        if(transaction.taxAmount.compareTo(transaction.amount)>0 ||
            (!transaction.type.equals("expense") && transaction.taxAmount.signum()>0))
            throw new IllegalArgumentException("Tax must be an included component of an expense, no greater than its total.");
    }
    @Transactional
    Map<String,Object> delete(User actor,String id) {
        User user=lock(actor);
        Transaction transaction=store.transactions().findByIdAndUserId(id,user.id).orElseThrow(Validation::missing);
        if(!transaction.inboxId.isEmpty()) {
            InboxEntry incoming=store.inbox().findByIdAndUserId(transaction.inboxId,user.id).orElseThrow(Validation::missing);
            incoming.status="ignored";incoming.ledgerId="";incoming.note="Linked transaction removed";
        }
        store.transactions().delete(transaction);store.audit(user,user.name,"Removed transaction");
        return store.state(user,user);
    }
    @Transactional
    Map<String,Object> budget(User actor,Map<String,String> form) {
        User user=lock(actor);String month=Validation.month(form.get("month")).toString(),category=form.get("category");
        if(!"Overall".equals(category) && !Validation.CATEGORIES.contains(category)) throw new IllegalArgumentException("Choose a valid budget category.");
        Budget budget=store.budgets().findByUserIdAndMonthAndCategory(user.id,month,category).orElseGet(Budget::new);
        budget.user=user;budget.month=month;budget.category=category;budget.amount=Validation.money(form.get("amount"),false);
        store.budgets().save(budget);store.audit(user,user.name,"Updated "+category+" budget");
        return store.state(user,user);
    }
    @Transactional
    Map<String,Object> deleteBudget(User actor,String id) {
        User user=lock(actor);
        Budget budget=store.budgets().findById(id).filter(b->b.user.getId().equals(user.id)).orElseThrow(Validation::missing);
        store.budgets().delete(budget);store.audit(user,user.name,"Removed "+budget.category+" budget for "+budget.month);
        return store.state(user,user);
    }
    @Transactional
    Map<String,Object> profile(User actor,Map<String,String> form) {
        User user=lock(actor);user.name=Validation.text(form.get("name"),"Name",60,true);
        boolean sharing="true".equals(form.getOrDefault("share",String.valueOf(user.share)));
        if(sharing!=user.share) store.audit(user,user.name,sharing?"Enabled admin viewing":"Revoked admin viewing");
        user.share=sharing;return store.state(user,user);
    }
    @Transactional
    Map<String,Object> review(User actor,String id,Map<String,String> form) {
        User user=lock(actor);
        InboxEntry entry=store.inbox().findByIdAndUserId(id,user.id).orElseThrow(Validation::missing);
        String action=form.get("action");
        if("restore".equals(action)) {
            if(!entry.status.equals("ignored")) throw new IllegalArgumentException("Only ignored entries can be restored.");
            entry.status="pending";entry.note="";
        } else {
            if(!entry.status.equals("pending")) throw new IllegalArgumentException("This entry has already been reviewed.");
            if("ignore".equals(action)) { entry.status="ignored";entry.note=Validation.text(form.get("note"),"Note",160,false); }
            else if("match".equals(action)) {
                String matchId=form.getOrDefault("transactionId",form.getOrDefault("matchId",""));
                Transaction transaction=store.transactions().findByIdAndUserId(matchId,user.id).orElseThrow(Validation::missing);
                if(!transaction.inboxId.isEmpty() || transaction.importKey!=null ||
                    !transaction.date.equals(entry.date) || transaction.amount.compareTo(entry.amount)!=0 || !transaction.method.equals(entry.method))
                    throw new IllegalArgumentException("Match an unlinked transaction with the same date, amount and method.");
                direction(entry.direction,transaction.type);
                if(entry.taxAmount.signum()>0&&!transaction.type.equals("expense"))
                    throw new IllegalArgumentException("Recorded expense tax requires an expense transaction.");
                transaction.inboxId=entry.id;transaction.importKey=entry.key;entry.ledgerId=transaction.id;entry.status="matched";
                if(entry.taxAmount.signum()>0) transaction.taxAmount=entry.taxAmount;
            } else if("categorize".equals(action)) {
                Transaction transaction=new Transaction();transaction.user=user;
                Map<String,String> fields=new HashMap<>(form);
                fields.put("date",entry.date.toString());fields.put("description",entry.description);
                fields.put("amount",entry.amount.toPlainString());fields.put("method",entry.method);
                fields.put("taxAmount",entry.taxAmount.toPlainString());
                direction(entry.direction,fields.get("type"));fill(transaction,fields);
                transaction.inboxId=entry.id;transaction.importKey=entry.key;transaction.source="statement";
                store.transactions().save(transaction);entry.ledgerId=transaction.id;entry.status="categorized";
            } else throw new IllegalArgumentException("Choose a valid review action.");
        }
        store.audit(user,user.name,"Reviewed statement entry: "+action);return store.state(user,user);
    }
    static void direction(String direction,String type) {
        if((direction.equals("DEBIT")&&!Set.of("expense","transfer").contains(type)) ||
            (direction.equals("CREDIT")&&!Set.of("income","refund","transfer").contains(type)))
            throw new IllegalArgumentException("Transaction type conflicts with statement direction.");
    }
}
