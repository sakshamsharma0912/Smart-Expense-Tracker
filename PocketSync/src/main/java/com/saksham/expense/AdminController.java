package com.saksham.expense;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/admin")
class AdminController {
    private final AuthService auth;private final AdminService admin;
    AdminController(AuthService auth,AdminService admin) { this.auth=auth;this.admin=admin; }
    @GetMapping("/users")
    Map<String,Object> users(@AuthenticationPrincipal Jwt jwt) { return admin.directory(auth.current(jwt)); }
    @GetMapping("/users/{id}/state")
    Map<String,Object> shared(@AuthenticationPrincipal Jwt jwt,@PathVariable String id) { return admin.shared(auth.current(jwt),id); }
}
