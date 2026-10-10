package com.saksham.expense;

import jakarta.servlet.http.HttpServletResponse;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api")
class AuthController {
    private final AuthService auth;private final WorkspaceService workspace;
    AuthController(AuthService auth,WorkspaceService workspace) { this.auth=auth;this.workspace=workspace; }
    @GetMapping("/public")
    Map<String,Object> publicInfo() { return WorkspaceService.data("setupRequired",false,"adminName",workspace.adminName(),"runtime","spring-boot"); }
    @PostMapping("/register")
    Map<String,Object> register(@RequestParam Map<String,String> fields,HttpServletResponse response) { return auth.register(fields,response); }
    @PostMapping("/login")
    Map<String,Object> login(@RequestParam Map<String,String> fields,HttpServletResponse response) { return auth.login(fields,response); }
    @PostMapping("/refresh")
    Map<String,Object> refresh(@CookieValue(value="expense_refresh",required=false) String token,HttpServletResponse response) {
        return auth.rotate(token,response);
    }
    @PostMapping("/logout")
    Map<String,Object> logout(@AuthenticationPrincipal Jwt jwt,HttpServletResponse response) {
        auth.logout(auth.current(jwt),response);return Map.of("ok",true);
    }
    @PutMapping("/password")
    Map<String,Object> password(@AuthenticationPrincipal Jwt jwt,@RequestParam Map<String,String> fields,HttpServletResponse response) {
        return auth.changePassword(auth.current(jwt),fields,response);
    }
}
