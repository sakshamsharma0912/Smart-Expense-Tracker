package com.saksham.expense;

import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class AdminService {
    private final WorkspaceService store;
    AdminService(WorkspaceService store) { this.store=store; }
    static void requireAdmin(User user) { if(!user.role.equals("ADMIN")) throw Validation.denied(); }
    @Transactional(readOnly=true)
    Map<String,Object> directory(User viewer) {
        requireAdmin(viewer);
        YearMonth month=YearMonth.now(ZoneId.of("Asia/Kolkata"));
        List<Map<String,Object>> entries=new ArrayList<>();
        for(User user:store.users().findByRole("USER")) {
            BigDecimal spent=null;Long pending=null;
            if(user.share) {
                spent=store.transactions().findByUserIdAndDateBetweenOrderByDateAsc(user.id,month.atDay(1),month.atEndOfMonth())
                    .stream().filter(t->t.type.equals("expense")).map(t->t.amount).reduce(BigDecimal.ZERO,BigDecimal::add);
                pending=store.inbox().findByUserIdOrderByReceivedAtDesc(user.id).stream().filter(i->i.status.equals("pending")).count();
            }
            entries.add(WorkspaceService.data("id",user.id,"name",user.name,"email",user.email,"share",user.share,
                "createdAt",user.createdAt.toString(),"spent",spent==null?null:spent.toPlainString(),"pending",pending));
        }
        return WorkspaceService.data("month",month.toString(),"users",entries);
    }
    @Transactional
    Map<String,Object> shared(User viewer,String id) {
        requireAdmin(viewer);
        User owner=store.users().lockById(id).orElseThrow(Validation::missing);
        if(!owner.share || !owner.role.equals("USER")) throw Validation.denied();
        // Periodic UI refreshes count as the same visit for one minute.
        Instant lastVisit=store.audits().findTop100ByUserIdOrderByAtDesc(owner.id).stream()
            .filter(a->a.actor.equals(viewer.name)&&a.event.equals("Admin viewed shared tracker")).map(a->a.at).findFirst().orElse(Instant.EPOCH);
        if(lastVisit.isBefore(Instant.now().minusSeconds(60))) store.audit(owner,viewer.name,"Admin viewed shared tracker");
        return store.state(owner,viewer);
    }
}
