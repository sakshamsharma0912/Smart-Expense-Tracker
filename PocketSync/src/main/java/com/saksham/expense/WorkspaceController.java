package com.saksham.expense;

import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api")
class WorkspaceController {
    private final AuthService auth;private final WorkspaceService store;private final TransactionService transactions;private final RecurringService recurring;
    WorkspaceController(AuthService auth,WorkspaceService store,TransactionService transactions,RecurringService recurring) {
        this.auth=auth;this.store=store;this.transactions=transactions;this.recurring=recurring;
    }
    @GetMapping("/state")
    Map<String,Object> state(@AuthenticationPrincipal Jwt jwt) { User user=auth.current(jwt);recurring.sync(user);return store.state(user,user); }
    @PostMapping("/transactions")
    Map<String,Object> create(@AuthenticationPrincipal Jwt jwt,@RequestParam Map<String,String> fields) {
        return transactions.save(auth.current(jwt),null,fields);
    }
    @PutMapping("/transactions/{id}")
    Map<String,Object> update(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestParam Map<String,String> fields) {
        return transactions.save(auth.current(jwt),id,fields);
    }
    @DeleteMapping("/transactions/{id}")
    Map<String,Object> delete(@AuthenticationPrincipal Jwt jwt,@PathVariable String id) { return transactions.delete(auth.current(jwt),id); }
    @PutMapping("/budgets")
    Map<String,Object> budget(@AuthenticationPrincipal Jwt jwt,@RequestParam Map<String,String> fields) {
        return transactions.budget(auth.current(jwt),fields);
    }
    @DeleteMapping("/budgets/{id}")
    Map<String,Object> deleteBudget(@AuthenticationPrincipal Jwt jwt,@PathVariable String id) {
        return transactions.deleteBudget(auth.current(jwt),id);
    }
    @PutMapping("/profile")
    Map<String,Object> profile(@AuthenticationPrincipal Jwt jwt,@RequestParam Map<String,String> fields) {
        return transactions.profile(auth.current(jwt),fields);
    }
    @PutMapping("/inbox/{id}")
    Map<String,Object> review(@AuthenticationPrincipal Jwt jwt,@PathVariable String id,@RequestParam Map<String,String> fields) {
        return transactions.review(auth.current(jwt),id,fields);
    }
}
