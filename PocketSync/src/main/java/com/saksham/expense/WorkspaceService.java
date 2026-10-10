package com.saksham.expense;

import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class WorkspaceService {
    final UserRepository users;
    final TransactionRepository transactions;
    final BudgetRepository budgets;
    final InboxRepository inbox;
    final AuditRepository audits;
    final RecurringRepository recurring;
    WorkspaceService(UserRepository users,TransactionRepository transactions,BudgetRepository budgets,InboxRepository inbox,AuditRepository audits,RecurringRepository recurring) {
        this.users=users;this.transactions=transactions;this.budgets=budgets;this.inbox=inbox;this.audits=audits;this.recurring=recurring;
    }
    UserRepository users() { return users; }
    TransactionRepository transactions() { return transactions; }
    BudgetRepository budgets() { return budgets; }
    InboxRepository inbox() { return inbox; }
    AuditRepository audits() { return audits; }
    @Transactional(readOnly=true)
    Map<String,Object> state(User owner,User viewer) {
        owner=AuthService.resolved(owner);viewer=AuthService.resolved(viewer);
        return data("runtime","spring-boot","profile",data("id",owner.id,"name",owner.name,"email",owner.email,
            "role",owner.role,"share",owner.share,"createdAt",owner.createdAt.toString()),
            "viewer",data("id",viewer.id,"name",viewer.name,"role",viewer.role,"readOnly",!owner.id.equals(viewer.id)),
            "transactions",transactions.findByUserIdOrderByDateDescCreatedAtDesc(owner.id).stream().map(WorkspaceService::transaction).toList(),
            "inbox",inbox.findByUserIdOrderByReceivedAtDesc(owner.id).stream().map(WorkspaceService::incoming).toList(),
            "budgets",budgets.findByUserId(owner.id).stream().map(b->data("id",b.id,"month",b.month,"category",b.category,"amount",b.amount.toPlainString())).toList(),
            "recurring",recurring.findByUserIdAndArchivedFalseOrderByNextDateAsc(owner.id).stream().map(RecurringService::view).toList(),
            "audit",audits.findTop100ByUserIdOrderByAtDesc(owner.id).stream().map(a->data("id",a.id,"at",a.at.toString(),"actor",a.actor,"event",a.event)).toList(),
            "integration",data("live",false,"adapterConfigured",false,"allowed",false),"adminName",adminName());
    }
    String adminName() { return users.findByRole("ADMIN").stream().findFirst().map(u->u.name).orElse("Project administrator"); }
    @Transactional
    void audit(User user,String actor,String message) {
        AuditEvent event=new AuditEvent();event.user=user;event.actor=actor;event.event=message;audits.save(event);
    }
    static Map<String,Object> transaction(Transaction t) {
        return data("id",t.id,"date",t.date.toString(),"description",t.description,"category",t.category,
            "amount",t.amount.toPlainString(),"type",t.type,"method",t.method,"notes",t.notes,
            "source",t.source,"inboxId",t.inboxId,"taxAmount",t.taxAmount.toPlainString());
    }
    static Map<String,Object> incoming(InboxEntry i) {
        return data("id",i.id,"date",i.date.toString(),"description",i.description,"amount",i.amount.toPlainString(),
            "direction",i.direction,"method",i.method,"source",i.source,"suggested",i.suggested,
            "status",i.status,"ledgerId",i.ledgerId,"note",i.note,"reference",i.reference,
            "account",i.account,"key",i.key,"taxAmount",i.taxAmount.toPlainString(),"receivedAt",i.receivedAt.toString());
    }
    static Map<String,Object> data(Object... values) {
        Map<String,Object> map=new LinkedHashMap<>();
        for(int i=0;i<values.length;i+=2) map.put((String)values[i],values[i+1]);
        return map;
    }
}
