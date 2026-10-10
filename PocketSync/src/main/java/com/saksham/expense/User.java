package com.saksham.expense;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity @Table(name="app_users")
public class User {
    public String getId() { return id; }
    @Id @Column(length=36) String id = UUID.randomUUID().toString();
    @Column(nullable=false,length=60) String name;
    @Column(nullable=false,unique=true,length=120) String email;
    @Column(name="password_hash",nullable=false,length=400) String passwordHash;
    @Column(nullable=false,length=5) String role = "USER";
    @Column(name="share_tracker",nullable=false) boolean share;
    @Column(nullable=false) boolean active = true;
    @Column(name="token_version",nullable=false) int tokenVersion;
    @Column(name="created_at",nullable=false) Instant createdAt = Instant.now();
    protected User() {}
}
