package com.saksham.expense;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;

@Entity @Table(name="recurring_transactions")
public class RecurringTransaction {
    @Id @Column(length=36) String id=UUID.randomUUID().toString();
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="user_id") User user;
    @Column(nullable=false,length=100) String description;
    @Column(name="plan_name",nullable=false,length=60) String plan="";
    @Column(nullable=false,length=24) String category;
    @Column(nullable=false,precision=11,scale=2) BigDecimal amount;
    @Column(name="entry_type",nullable=false,length=12) String type="expense";
    @Column(nullable=false,length=12) String method;
    @Column(nullable=false,length=12) String frequency;
    @Column(name="anchor_date",nullable=false) LocalDate startDate;
    @Column(name="next_date",nullable=false) LocalDate nextDate;
    @Column(name="end_date") LocalDate endDate;
    @Column(nullable=false) boolean active=true;
    @Column(nullable=false) boolean archived=false;
    @Column(name="auto_post",nullable=false) boolean autoPost=false;
    @Column(nullable=false,length=500) String notes="";
    @Column(name="tax_amount",nullable=false,precision=11,scale=2) BigDecimal taxAmount=BigDecimal.ZERO;
    @Column(name="created_at",nullable=false) Instant createdAt=Instant.now();
    protected RecurringTransaction() {}
}
