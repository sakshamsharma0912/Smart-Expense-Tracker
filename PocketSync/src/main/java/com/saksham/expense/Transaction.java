package com.saksham.expense;

import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;

@Entity @Table(name="expense_transactions",
    uniqueConstraints=@UniqueConstraint(columnNames={"user_id","import_key"}))
public class Transaction {
    @Id @Column(length=80) String id = UUID.randomUUID().toString();
    @ManyToOne(fetch=FetchType.LAZY,optional=false)
    @JoinColumn(name="user_id",nullable=false) User user;
    @Column(name="occurred_on",nullable=false) LocalDate date;
    @Column(nullable=false,length=100) String description;
    @Column(nullable=false,length=24) String category;
    @Column(nullable=false,precision=11,scale=2) BigDecimal amount;
    @Column(name="entry_type",nullable=false,length=12) String type;
    @Column(nullable=false,length=12) String method;
    @Column(nullable=false,length=500) String notes = "";
    @Column(nullable=false,length=40) String source = "manual";
    @Column(name="inbox_id",nullable=false,length=36) String inboxId = "";
    @Column(name="import_key",length=64) String importKey;
    @Column(name="tax_amount",nullable=false,precision=11,scale=2) BigDecimal taxAmount = BigDecimal.ZERO;
    @Column(name="created_at",nullable=false) Instant createdAt = Instant.now();
    protected Transaction() {}
}
