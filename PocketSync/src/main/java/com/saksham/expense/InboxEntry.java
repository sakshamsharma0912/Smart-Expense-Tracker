package com.saksham.expense;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.UUID;
@Entity @Table(name="statement_inbox",uniqueConstraints=@UniqueConstraint(columnNames={"user_id","external_key"}))
public class InboxEntry {
    @Id @Column(length=36) String id = UUID.randomUUID().toString();
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="user_id") User user;
    @Column(name="external_key",nullable=false,length=64) String key;
    @Column(name="reference_text",nullable=false,length=120) String reference;
    @Column(name="account_label",nullable=false,length=80) String account;
    @Column(name="occurred_on",nullable=false) LocalDate date;
    @Column(nullable=false,length=100) String description;
    @Column(nullable=false,precision=11,scale=2) BigDecimal amount;
    @Column(name="tax_amount",nullable=false,precision=11,scale=2) BigDecimal taxAmount = BigDecimal.ZERO;
    @Column(nullable=false,length=6) String direction;
    @Column(nullable=false,length=12) String method;
    @Column(nullable=false,length=40) String source = "statement";
    @Column(nullable=false,length=24) String suggested;
    @Column(nullable=false,length=12) String status = "pending";
    @Column(name="ledger_id",nullable=false,length=80) String ledgerId = "";
    @Column(nullable=false,length=160) String note = "";
    @Column(name="received_at",nullable=false) Instant receivedAt = Instant.now();
    protected InboxEntry() {}
}
