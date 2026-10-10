package com.saksham.expense;

import jakarta.servlet.http.*;
import java.time.Instant;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.hibernate.Hibernate;

@Service
class AuthService {
    private final UserRepository users;
    private final RefreshRepository refresh;
    private final PasswordCodec passwords;
    private final JwtEncoder encoder;
    private final WorkspaceService workspace;
    private final String issuer;
    private final long lifetime;
    private final boolean secure;
    AuthService(UserRepository users,RefreshRepository refresh,PasswordCodec passwords,JwtEncoder encoder,
        WorkspaceService workspace,@Value("${expense.issuer}") String issuer,
        @Value("${expense.access-seconds:900}") long lifetime,@Value("${expense.cookie-secure:false}") boolean secure) {
        this.users=users;this.refresh=refresh;this.passwords=passwords;this.encoder=encoder;
        this.workspace=workspace;this.issuer=issuer;this.lifetime=lifetime;this.secure=secure;
    }
    User current(Jwt jwt) {
        if(jwt==null) throw unauthorized();
        User user=resolved(users.findById(jwt.getSubject()).orElseThrow(AuthService::unauthorized));
        Number version=jwt.getClaim("ver");
        if(!user.active || version==null || version.intValue()!=user.tokenVersion) throw unauthorized();
        return user;
    }
    @Transactional
    Map<String,Object> register(Map<String,String> form,HttpServletResponse response) {
        String email=email(form.get("email"));
        if(!"true".equals(form.get("noticeAccepted"))) throw new IllegalArgumentException("Accept the account privacy notice.");
        PasswordCodec.validate(form.get("password"));
        if(users.findByEmail(email).isPresent()) throw new IllegalArgumentException("That email already has an account.");
        User user=new User();user.name=Validation.text(form.get("name"),"Name",60,true);user.email=email;
        user.passwordHash=passwords.encode(form.get("password"));user.share="true".equals(form.get("share"));
        users.saveAndFlush(user);
        workspace.audit(user,user.name,"Account created");
        return issue(user,response);
    }
    @Transactional
    Map<String,Object> login(Map<String,String> form,HttpServletResponse response) {
        User found=users.findByEmail(email(form.get("email"))).orElseThrow(AuthService::unauthorized);
        User user=resolved(users.lockById(found.id).orElseThrow(AuthService::unauthorized));
        String password=form.getOrDefault("password","");
        if(password.length()>128 || !user.active || !passwords.matches(password,user.passwordHash)) throw unauthorized();
        String requested=form.getOrDefault("loginRole","USER");
        if(!requested.equals(user.role)) throw unauthorized();
        if(user.passwordHash.startsWith("{legacy}")) user.passwordHash=passwords.encode(password);
        return issue(user,response);
    }
    @Transactional
    Map<String,Object> rotate(String raw,HttpServletResponse response) {
        if(raw==null || raw.length()>100) throw unauthorized();
        String hash=Validation.hash(raw);
        RefreshToken candidate=refresh.findById(hash).orElseThrow(AuthService::unauthorized);
        // Consistent user -> refresh lock order also serializes logout/password changes.
        User user=resolved(users.lockById(candidate.user.getId()).orElseThrow(AuthService::unauthorized));
        RefreshToken old=refresh.lockByHash(hash).orElseThrow(AuthService::unauthorized);
        if(old.expiresAt.isBefore(Instant.now()) || !user.active) throw unauthorized();
        refresh.delete(old);refresh.flush();
        return issue(user,response);
    }
    Map<String,Object> issue(User user,HttpServletResponse response) {
        // Lazy associations can put a proxy into the persistence context before
        // the owner lock is acquired. Direct entity fields must use its target.
        user=resolved(user);
        Instant now=Instant.now();
        JwtClaimsSet claims=JwtClaimsSet.builder().issuer(issuer).subject(user.id).issuedAt(now)
            .expiresAt(now.plusSeconds(lifetime)).audience(List.of("expense-api"))
            .claim("roles",List.of(user.role)).claim("ver",user.tokenVersion).build();
        String token=encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(),claims)).getTokenValue();
        String secret=Validation.token();
        RefreshToken entry=new RefreshToken();entry.hash=Validation.hash(secret);entry.user=user;entry.expiresAt=now.plusSeconds(7*86400);
        refresh.save(entry);
        cookie(response,secret,7*86400);
        Map<String,Object> payload=new LinkedHashMap<>(workspace.state(user,user));
        payload.put("accessToken",token);payload.put("expiresIn",lifetime);
        return payload;
    }
    @Transactional
    void logout(User user,HttpServletResponse response) {
        User locked=resolved(users.lockById(user.id).orElseThrow(AuthService::unauthorized));
        if(locked.tokenVersion!=user.tokenVersion) throw unauthorized();
        locked.tokenVersion++;refresh.deleteByUserId(user.id);cookie(response,"",0);
    }
    @Transactional
    Map<String,Object> changePassword(User user,Map<String,String> form,HttpServletResponse response) {
        User locked=resolved(users.lockById(user.id).orElseThrow(AuthService::unauthorized));
        if(locked.tokenVersion!=user.tokenVersion) throw unauthorized();
        if(!passwords.matches(form.getOrDefault("currentPassword",""),locked.passwordHash)) throw unauthorized();
        String password=form.get("newPassword");PasswordCodec.validate(password);
        if(!password.equals(form.get("confirmPassword"))) throw new IllegalArgumentException("The new passwords do not match.");
        locked.passwordHash=passwords.encode(password);locked.tokenVersion++;
        refresh.deleteByUserId(user.id);workspace.audit(locked,locked.name,"Password changed; previous tokens revoked");
        return issue(locked,response);
    }
    private void cookie(HttpServletResponse response,String token,long seconds) {
        response.addHeader("Set-Cookie",ResponseCookie.from("expense_refresh",token).httpOnly(true).secure(secure)
            .sameSite("Strict").path("/api/refresh").maxAge(seconds).build().toString());
    }
    static String email(String input) {
        String email=Validation.text(input,"Email",120,true).toLowerCase(Locale.ROOT);
        if(!email.matches("[^\\s@]+@[^\\s@]+\\.[^\\s@]+")) throw new IllegalArgumentException("Enter a valid email.");
        return email;
    }
    static User resolved(User user) { return (User)Hibernate.unproxy(user); }
    static ResponseStatusException unauthorized() { return new ResponseStatusException(HttpStatus.UNAUTHORIZED,"Email, password or authentication token is invalid."); }
}
