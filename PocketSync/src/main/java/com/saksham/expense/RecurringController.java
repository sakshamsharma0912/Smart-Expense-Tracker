package com.saksham.expense;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/recurring")
class RecurringController {
    private final AuthService auth;private final RecurringService recurring;private final WorkspaceService store;
    RecurringController(AuthService auth,RecurringService recurring,WorkspaceService store) {this.auth=auth;this.recurring=recurring;this.store=store;}
    @PostMapping Map<String,Object> add(@AuthenticationPrincipal Jwt jwt,@RequestParam Map<String,String> fields) {
        return recurring.save(auth.current(jwt),null,fields);
    }
    @PutMapping("/{id}") Map<String,Object> edit(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestParam Map<String,String> fields) {
        return recurring.save(auth.current(jwt),id,fields);
    }
    @PutMapping("/{id}/status") Map<String,Object> status(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestParam Map<String,String> fields) {
        return recurring.status(auth.current(jwt),id,fields);
    }
    @PostMapping("/{id}/record") Map<String,Object> record(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestParam String dueDate) {
        return recurring.record(auth.current(jwt),id,dueDate);
    }
    @DeleteMapping("/{id}") Map<String,Object> remove(@AuthenticationPrincipal Jwt jwt,@PathVariable String id) {
        return recurring.remove(auth.current(jwt),id);
    }
    @PostMapping("/sync") Map<String,Object> sync(@AuthenticationPrincipal Jwt jwt) {
        User user=auth.current(jwt);int count=recurring.sync(user);
        return WorkspaceService.data("recorded",count,"state",store.state(user,user));
    }
}
