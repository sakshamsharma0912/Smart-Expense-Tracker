package com.saksham.expense;

import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.*;
import org.springframework.stereotype.*;
import org.springframework.transaction.annotation.Transactional;

@Component
class StartupData implements ApplicationRunner {
    private final V4MigrationService migration;private final AdminBootstrap bootstrap;
    private final String source,sourceUser,sourcePassword,email,name,password;
    StartupData(V4MigrationService migration,AdminBootstrap bootstrap,
        @Value("${expense.migration-source:}") String source,@Value("${V4_H2_USERNAME:tracker}") String sourceUser,
        @Value("${V4_H2_PASSWORD:}") String sourcePassword,@Value("${expense.bootstrap-email:}") String email,
        @Value("${expense.bootstrap-name:Project owner}") String name,@Value("${expense.bootstrap-password:}") String password) {
        this.migration=migration;this.bootstrap=bootstrap;this.source=source;this.sourceUser=sourceUser;
        this.sourcePassword=sourcePassword;this.email=email;this.name=name;this.password=password;
    }
    @Override public void run(ApplicationArguments arguments) throws Exception {
        if(!source.isBlank()) {
            Map<String,Integer> counts=migration.migrate(source,sourceUser,sourcePassword);
            LoggerFactory.getLogger(StartupData.class).info("V4 migration completed: {}",counts);
        }
        if(!email.isBlank()) bootstrap.create(email,name,password);
    }
}
@Service
class AdminBootstrap {
    private final UserRepository users;private final PasswordCodec passwords;private final WorkspaceService store;
    AdminBootstrap(UserRepository users,PasswordCodec passwords,WorkspaceService store) {
        this.users=users;this.passwords=passwords;this.store=store;
    }
    @Transactional
    void create(String email,String name,String password) {
        String normalized=AuthService.email(email);
        if(!users.findByRole("ADMIN").isEmpty()) return;
        if(users.findByEmail(normalized).isPresent()) throw new IllegalStateException("Bootstrap email is already a regular user. Choose another email.");
        PasswordCodec.validate(password);
        User admin=new User();admin.name=Validation.text(name,"Name",60,true);admin.email=normalized;admin.role="ADMIN";
        admin.passwordHash=passwords.encode(password);users.save(admin);store.audit(admin,admin.name,"Administrator created from startup configuration");
    }
}
