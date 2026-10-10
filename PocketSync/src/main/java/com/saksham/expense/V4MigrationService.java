package com.saksham.expense;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.sql.*;
import java.time.Instant;
import java.util.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Optional one-time, read-only V4 source -> empty V5 target migration, including password compatibility. */
@Service
class V4MigrationService {
    private final WorkspaceService store;
    V4MigrationService(WorkspaceService store) { this.store=store; }
    @Transactional(rollbackFor=Exception.class)
    Map<String,Integer> migrate(String source,String username,String password) throws Exception {
        if(store.users().count()!=0 || store.transactions().count()!=0)
            throw new IllegalStateException("V4 migration requires a completely empty target. No existing accounts were changed.");
        Path input=Path.of(source).toAbsolutePath().normalize();
        String path=input.toString();
        if(path.endsWith(".mv.db")) path=path.substring(0,path.length()-6);
        if(path.contains(";")||!Files.isRegularFile(Path.of(path+".mv.db")))
            throw new IllegalStateException("V4_H2_PATH must name an existing V4 H2 database, without JDBC options.");
        Map<String,User> owners=new HashMap<>();
        Map<String,InboxEntry> inboxByOldId=new HashMap<>();int txCount=0,budgetCount=0,auditCount=0;
        try(Connection connection=DriverManager.getConnection("jdbc:h2:file:"+path+";IFEXISTS=TRUE;ACCESS_MODE_DATA=r",username,password)) {
            try(Statement statement=connection.createStatement();ResultSet rows=statement.executeQuery("SELECT * FROM accounts ORDER BY created_at,id")) {
                while(rows.next()) {
                    String algorithm=rows.getString("password_algorithm");
                    int iterations=rows.getInt("password_iterations");
                    if(!"PBKDF2WithHmacSHA256".equals(algorithm)||iterations<100000||iterations>2000000)
                        throw new IllegalStateException("Unsupported V4 password hash settings; migration rolled back.");
                    User user=new User();user.id=rows.getString("id");user.name=Validation.text(rows.getString("name"),"Name",60,true);
                    user.email=AuthService.email(rows.getString("email"));user.role=rows.getString("role");
                    if(!Set.of("ADMIN","USER").contains(user.role)) throw new IllegalArgumentException("Invalid migrated role.");
                    user.share=rows.getBoolean("share_tracker");user.createdAt=Instant.parse(rows.getString("created_at"));
                    user.passwordHash="{legacy}"+iterations+"$"+rows.getString("password_salt")+"$"+rows.getString("password_hash");
                    store.users().save(user);owners.put(user.id,user);
                }
            }
            store.users().flush();
            try(Statement statement=connection.createStatement();ResultSet rows=statement.executeQuery("SELECT * FROM inbox_entries ORDER BY account_id,row_index")) {
                while(rows.next()) {
                    User user=owner(owners,rows);String oldId=rows.getString("record_id");
                    InboxEntry i=new InboxEntry();i.id=id("inbox",user.id,oldId);i.user=user;
                    i.key=rows.getString("external_key");i.reference=rows.getString("reference");i.account=rows.getString("account_label");
                    i.date=rows.getDate("occurred_on").toLocalDate();i.description=rows.getString("description");
                    i.amount=rows.getBigDecimal("amount");i.direction=rows.getString("direction");i.method=rows.getString("method");
                    i.source=rows.getString("source");i.suggested=rows.getString("suggested");i.status=rows.getString("status");
                    String ledger=rows.getString("ledger_id");i.ledgerId=ledger.isEmpty()?"":id("transaction",user.id,ledger);
                    i.note=rows.getString("note");i.receivedAt=Instant.parse(rows.getString("received_at"));
                    store.inbox().save(i);inboxByOldId.put(user.id+"\u0000"+oldId,i);
                }
            }
            try(Statement statement=connection.createStatement();ResultSet rows=statement.executeQuery("SELECT * FROM transactions ORDER BY account_id,row_index")) {
                while(rows.next()) {
                    User user=owner(owners,rows);String oldId=rows.getString("record_id");
                    Transaction t=new Transaction();t.id=id("transaction",user.id,oldId);t.user=user;
                    Map<String,String> fields=new HashMap<>();
                    for(String key:List.of("description","category","amount","method","notes")) fields.put(key,rows.getString(key));
                    fields.put("date",rows.getDate("occurred_on").toString());fields.put("type",rows.getString("entry_type"));
                    TransactionService.fill(t,fields);t.source=rows.getString("source");t.createdAt=user.createdAt;
                    String linked=rows.getString("inbox_id");
                    if(!linked.isEmpty()) {
                        InboxEntry i=inboxByOldId.get(user.id+"\u0000"+linked);
                        if(i==null || !i.ledgerId.equals(t.id)) throw new IllegalStateException("V4 contains a broken inbox link; migration rolled back.");
                        t.inboxId=i.id;t.importKey=i.key;
                    } else if(oldId.startsWith("legacy-")) t.importKey=Validation.hash(oldId);
                    store.transactions().save(t);txCount++;
                }
            }
            try(Statement statement=connection.createStatement();ResultSet rows=statement.executeQuery("SELECT * FROM budgets ORDER BY account_id,row_index")) {
                while(rows.next()) {
                    User user=owner(owners,rows);Budget b=new Budget();b.user=user;b.id=id("budget",user.id,rows.getString("record_id"));
                    b.month=Validation.month(rows.getString("report_month")).toString();b.category=rows.getString("category");
                    if(!b.category.equals("Overall")&&!Validation.CATEGORIES.contains(b.category)) throw new IllegalArgumentException("Invalid migrated budget category.");
                    b.amount=Validation.money(rows.getString("amount"),false);store.budgets().save(b);budgetCount++;
                }
            }
            try(Statement statement=connection.createStatement();ResultSet rows=statement.executeQuery("SELECT * FROM activity_log ORDER BY account_id,row_index")) {
                while(rows.next()) {
                    User user=owner(owners,rows);AuditEvent a=new AuditEvent();a.user=user;a.id=id("audit",user.id,rows.getString("record_id"));
                    a.at=Instant.parse(rows.getString("happened_at"));a.actor=rows.getString("actor");a.event=rows.getString("event");
                    store.audits().save(a);auditCount++;
                }
            }
        }
        store.transactions().flush();store.inbox().flush();store.budgets().flush();store.audits().flush();
        return Map.of("users",owners.size(),"transactions",txCount,"inbox",inboxByOldId.size(),"budgets",budgetCount,"audit",auditCount);
    }
    static User owner(Map<String,User> owners,ResultSet rows) throws SQLException {
        User user=owners.get(rows.getString("account_id"));
        if(user==null) throw new IllegalStateException("Source record has no owner.");return user;
    }
    static String id(String kind,String user,String oldId) {
        return UUID.nameUUIDFromBytes((kind+"\u0000"+user+"\u0000"+oldId).getBytes(StandardCharsets.UTF_8)).toString();
    }
}
