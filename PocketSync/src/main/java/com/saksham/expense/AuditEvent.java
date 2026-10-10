package com.saksham.expense;
import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;
@Entity @Table(name="expense_audit")
public class AuditEvent {
    @Id @Column(length=36) String id = UUID.randomUUID().toString();
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="user_id") User user;
    @Column(name="happened_at",nullable=false) Instant at = Instant.now();
    @Column(nullable=false,length=60) String actor;
    @Column(name="event_text",nullable=false,length=260) String event;
    protected AuditEvent() {}
}
