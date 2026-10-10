package com.saksham.expense;

import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
class RecurringScheduler {
    private final RecurringRepository recurring;private final UserRepository users;private final RecurringService service;
    RecurringScheduler(RecurringRepository recurring,UserRepository users,RecurringService service) {this.recurring=recurring;this.users=users;this.service=service;}
    @Scheduled(fixedDelayString="${expense.recurring-delay-ms:60000}",initialDelayString="${expense.recurring-delay-ms:60000}")
    void process() {
        for(String id:recurring.automaticOwners()) {
            try {users.findById(id).filter(u->u.active).ifPresent(service::sync);}
            catch(Exception error) {LoggerFactory.getLogger(getClass()).warn("Recurring processing deferred for an account: {}",error.getClass().getSimpleName());}
        }
    }
}
