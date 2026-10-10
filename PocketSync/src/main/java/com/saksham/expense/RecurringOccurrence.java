package com.saksham.expense;

import jakarta.persistence.*;
import java.time.*;
import java.util.UUID;

@Entity @Table(name="recurring_occurrences",uniqueConstraints=@UniqueConstraint(columnNames={"recurring_id","due_date"}))
public class RecurringOccurrence {
    @Id @Column(length=36) String id=UUID.randomUUID().toString();
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="recurring_id") RecurringTransaction recurring;
    @Column(name="due_date",nullable=false) LocalDate dueDate;
    // Keep the occurrence even when the user removes its ledger transaction.
    @Column(name="transaction_id",nullable=false,length=80) String transactionId;
    @Column(name="created_at",nullable=false) Instant createdAt=Instant.now();
    protected RecurringOccurrence() {}
}
