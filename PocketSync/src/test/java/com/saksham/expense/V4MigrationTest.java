package com.saksham.expense;

import static org.assertj.core.api.Assertions.*;
import java.nio.file.*;
import java.nio.charset.StandardCharsets;
import java.sql.*;
import java.util.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletResponse;

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:integration;DB_CLOSE_DELAY=-1",
    "expense.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "expense.bootstrap-email=","expense.migration-source="
})
@AutoConfigureMockMvc
class V4MigrationTest {
    @Autowired V4MigrationService migration;@Autowired UserRepository users;@Autowired WorkspaceService store;
    @Autowired AuthService auth;@Autowired JdbcTemplate jdbc;@TempDir Path temp;
    static final String ONE="00000000-0000-0000-0000-000000000001",TWO="00000000-0000-0000-0000-000000000002";
    static final String INBOX="00000000-0000-0000-0000-000000000009";
    @BeforeEach void reset() {
        for(String table:List.of("recurring_occurrences","recurring_transactions","refresh_tokens","expense_audit","statement_inbox","expense_budgets","expense_transactions","app_users"))
            jdbc.update("DELETE FROM "+table);
    }
    Path source(boolean invalid) throws Exception {
        Path path=temp.resolve("v4");
        try(Connection c=DriverManager.getConnection("jdbc:h2:file:"+path,"sa","");Statement statement=c.createStatement()) {
            String schema=new String(new ClassPathResource("v4-schema.sql").getContentAsByteArray(),StandardCharsets.UTF_8);
            for(String sql:schema.split(";")) if(!sql.isBlank()) statement.execute(sql);
            String salt=Base64.getEncoder().encodeToString(new byte[16]);
            PBEKeySpec spec=new PBEKeySpec("legacy-password-123".toCharArray(),new byte[16],210000,256);
            String hash=Base64.getEncoder().encodeToString(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded());
            spec.clearPassword();
            for(String id:List.of(ONE,TWO)) {
                try(PreparedStatement ps=c.prepareStatement("INSERT INTO accounts(id,name,email,role,password_salt,password_hash,created_at,share_tracker) VALUES(?,?,?,?,?,?,?,?)")) {
                    ps.setString(1,id);ps.setString(2,id.equals(ONE)?"Legacy User":"Legacy Owner");
                    ps.setString(3,id.equals(ONE)?"legacy@example.com":"owner@example.com");ps.setString(4,id.equals(ONE)?"USER":"ADMIN");
                    ps.setString(5,salt);ps.setString(6,hash);ps.setString(7,"2026-09-01T10:00:00Z");ps.setBoolean(8,true);ps.executeUpdate();
                }
                try(PreparedStatement ps=c.prepareStatement("INSERT INTO transactions VALUES(?,?,0,DATE '2026-10-01','College lunch','Food',250,'expense','UPI','Kept notes','manual',?)")) {
                    ps.setString(1,id);ps.setString(2,"same-record-id");ps.setString(3,id.equals(ONE)?INBOX:"");ps.executeUpdate();
                }
                try(PreparedStatement ps=c.prepareStatement("INSERT INTO budgets VALUES(?,?,0,'2026-10',?,1000)")) {
                    ps.setString(1,id);ps.setString(2,"2026-10_Overall");ps.setString(3,invalid?"Unknown":"Overall");ps.executeUpdate();
                }
            }
            try(PreparedStatement ps=c.prepareStatement("INSERT INTO inbox_entries VALUES(?,?,0,?,'REF1','My bank',DATE '2026-10-01','College lunch',250,'DEBIT','UPI','statement','Food','categorized','same-record-id','','2026-10-01T10:00:00Z')")) {
                ps.setString(1,ONE);ps.setString(2,INBOX);ps.setString(3,Validation.hash("My bank\u0000REF1"));ps.executeUpdate();
            }
            try(PreparedStatement ps=c.prepareStatement("INSERT INTO activity_log VALUES(?,?,0,'2026-10-01T10:00:00Z','Legacy User','Added expense')")) {
                ps.setString(1,ONE);ps.setString(2,UUID.randomUUID().toString());ps.executeUpdate();
            }
        }
        return path;
    }
    @Test void copiesEveryModuleRemapsPerUserIdsAndUpgradesPasswordOnLogin() throws Exception {
        Path path=source(false);
        assertThat(migration.migrate(path.toString(),"sa","")).containsEntry("users",2).containsEntry("transactions",2)
            .containsEntry("inbox",1).containsEntry("budgets",2).containsEntry("audit",1);
        User user=users.findById(ONE).orElseThrow();
        assertThat(user.passwordHash).startsWith("{legacy}");
        assertThat(store.transactions().findByUserIdOrderByDateDescCreatedAtDesc(ONE)).hasSize(1);
        Transaction t=store.transactions().findByUserIdOrderByDateDescCreatedAtDesc(ONE).get(0);
        assertThat(t.id).isNotEqualTo(store.transactions().findByUserIdOrderByDateDescCreatedAtDesc(TWO).get(0).id);
        assertThat(t.inboxId).isEqualTo(V4MigrationService.id("inbox",ONE,INBOX));
        assertThat(t.importKey).isEqualTo(Validation.hash("My bank\u0000REF1"));
        Map<String,Object> signedIn=auth.login(Map.of("email","legacy@example.com","password","legacy-password-123","loginRole","USER"),new MockHttpServletResponse());
        assertThat(signedIn).containsKey("accessToken");
        assertThat(users.findById(ONE).orElseThrow().passwordHash).startsWith("{pbkdf2}");
        try(Connection c=DriverManager.getConnection("jdbc:h2:file:"+path+";ACCESS_MODE_DATA=r","sa","");Statement s=c.createStatement();
            ResultSet r=s.executeQuery("SELECT COUNT(*) FROM accounts WHERE password_algorithm='PBKDF2WithHmacSHA256'")) {
            r.next();assertThat(r.getInt(1)).isEqualTo(2);
        }
        assertThatThrownBy(()->migration.migrate(path.toString(),"sa","")).hasMessageContaining("empty target");
        assertThat(users.count()).isEqualTo(2);
    }
    @Test void lateMigrationErrorRollsBackAllTargetRows() throws Exception {
        Path path=source(true);
        assertThatThrownBy(()->migration.migrate(path.toString(),"sa","")).hasMessageContaining("budget category");
        assertThat(users.count()).isZero();assertThat(store.transactions().count()).isZero();assertThat(store.inbox().count()).isZero();
    }
}
