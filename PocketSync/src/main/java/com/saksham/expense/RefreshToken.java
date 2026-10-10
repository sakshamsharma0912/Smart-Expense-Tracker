package com.saksham.expense;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name="refresh_tokens")
public class RefreshToken {
    @Id @Column(name="token_hash",length=64) String hash;
    @ManyToOne(fetch=FetchType.LAZY,optional=false) @JoinColumn(name="user_id") User user;
    @Column(name="expires_at",nullable=false) Instant expiresAt;
    protected RefreshToken() {}
}
