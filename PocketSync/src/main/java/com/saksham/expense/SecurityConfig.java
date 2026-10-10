package com.saksham.expense;

import com.nimbusds.jose.jwk.source.ImmutableSecret;
import jakarta.servlet.*;
import jakarta.servlet.http.*;
import java.io.IOException;
import java.net.URI;
import java.nio.file.*;
import java.security.SecureRandom;
import java.util.*;
import javax.crypto.spec.SecretKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.*;
import org.springframework.core.env.Environment;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.oauth2.core.*;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.*;
import org.springframework.security.oauth2.server.resource.authentication.*;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.security.web.authentication.www.BasicAuthenticationFilter;
import org.springframework.web.filter.OncePerRequestFilter;

@Configuration
class SecurityConfig {
    @Bean SecretKeySpec jwtKey(@Value("${expense.jwt-secret:}") String configured,Environment environment) throws IOException {
        byte[] key;
        if (!configured.isBlank()) {
            try { key=Base64.getDecoder().decode(configured); }
            catch(IllegalArgumentException e) { throw new IllegalStateException("JWT_SECRET must be Base64-encoded random bytes."); }
        } else {
            if (Arrays.stream(environment.getActiveProfiles()).anyMatch(p->p.equals("postgres")||p.equals("mysql")))
                throw new IllegalStateException("Set JWT_SECRET for the PostgreSQL/MySQL profile.");
            Path file=Path.of("data/jwt.key"); Files.createDirectories(file.getParent());
            if (!Files.exists(file)) {
                byte[] generated=new byte[32]; new SecureRandom().nextBytes(generated);
                try { Files.writeString(file,Base64.getEncoder().encodeToString(generated),StandardOpenOption.CREATE_NEW); }
                catch(FileAlreadyExistsException ignored) {}
                try { Files.setPosixFilePermissions(file,java.nio.file.attribute.PosixFilePermissions.fromString("rw-------")); }
                catch(UnsupportedOperationException ignored) {}
            }
            key=Base64.getDecoder().decode(Files.readString(file).trim());
        }
        if (key.length<32) throw new IllegalStateException("JWT_SECRET must decode to at least 32 random bytes.");
        return new SecretKeySpec(key,"HmacSHA256");
    }
    @Bean JwtEncoder jwtEncoder(SecretKeySpec key) { return new NimbusJwtEncoder(new ImmutableSecret<>(key)); }
    @Bean JwtDecoder jwtDecoder(SecretKeySpec key,@Value("${expense.issuer}") String issuer) {
        NimbusJwtDecoder decoder=NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
        OAuth2TokenValidator<Jwt> audience=jwt->jwt.getAudience().contains("expense-api")
            ? OAuth2TokenValidatorResult.success()
            : OAuth2TokenValidatorResult.failure(new OAuth2Error("invalid_token","Wrong audience.",null));
        decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(JwtValidators.createDefaultWithIssuer(issuer),audience));
        return decoder;
    }
    @Bean SecurityFilterChain security(HttpSecurity http) throws Exception {
        JwtGrantedAuthoritiesConverter roles=new JwtGrantedAuthoritiesConverter();
        roles.setAuthoritiesClaimName("roles"); roles.setAuthorityPrefix("ROLE_");
        JwtAuthenticationConverter converter=new JwtAuthenticationConverter(); converter.setJwtGrantedAuthoritiesConverter(roles);
        http.sessionManagement(s->s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            // API authentication uses Bearer headers. The refresh-cookie endpoint
            // has its own same-origin/custom-header check below.
            .csrf(csrf->csrf.disable())
            .authorizeHttpRequests(a->a
                .requestMatchers("/","/index.html","/*.js","/*.css","/favicon.ico","/error").permitAll()
                .requestMatchers("/api/public","/api/login","/api/register","/api/refresh").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN").anyRequest().authenticated())
            .oauth2ResourceServer(o->o.jwt(j->j.jwtAuthenticationConverter(converter))
                .authenticationEntryPoint((request,response,error)->jsonError(response,401,"Please sign in.")))
            .exceptionHandling(e->e.authenticationEntryPoint((request,response,error)->jsonError(response,401,"Please sign in."))
                .accessDeniedHandler((request,response,error)->jsonError(response,403,"Access denied.")))
            .headers(h->h.contentSecurityPolicy(c->c.policyDirectives(
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'")))
            .addFilterBefore(new RefreshOriginFilter(),BasicAuthenticationFilter.class);
        return http.build();
    }
    static void jsonError(HttpServletResponse response,int status,String error) throws IOException {
        response.setStatus(status); response.setContentType("application/json");
        response.getWriter().write("{\"error\":\""+error+"\"}");
    }
    static class RefreshOriginFilter extends OncePerRequestFilter {
        protected void doFilterInternal(HttpServletRequest request,HttpServletResponse response,FilterChain chain) throws ServletException,IOException {
            if (request.getRequestURI().equals("/api/refresh")) {
                boolean valid=request.getMethod().equals("POST") && "ExpenseTracker".equals(request.getHeader("X-Requested-With"));
                String origin=request.getHeader("Origin");
                if (origin!=null) {
                    try {
                        URI source=URI.create(origin);
                        int port=source.getPort()==-1 ? ("https".equals(source.getScheme())?443:80) : source.getPort();
                        valid &= source.getScheme().equals(request.getScheme()) &&
                            source.getHost().equalsIgnoreCase(request.getServerName()) && port==request.getServerPort();
                    } catch(Exception e) { valid=false; }
                }
                if (!valid) { jsonError(response,403,"Refresh requires a same-origin request."); return; }
            }
            chain.doFilter(request,response);
        }
    }
}
