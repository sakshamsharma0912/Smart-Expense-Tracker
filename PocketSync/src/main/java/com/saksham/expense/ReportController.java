package com.saksham.expense;

import java.io.IOException;
import java.util.Locale;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

@RestController @RequestMapping("/api/reports")
class ReportController {
    private final AuthService auth;private final ReportService reports;
    ReportController(AuthService auth,ReportService reports) { this.auth=auth;this.reports=reports; }
    @GetMapping("/monthly")
    ResponseEntity<byte[]> monthly(@AuthenticationPrincipal Jwt jwt,@RequestParam String month,
        @RequestParam(defaultValue="xlsx") String format) throws IOException {
        User user=auth.current(jwt);String extension=format.toLowerCase(Locale.ROOT);
        if(!extension.equals("xlsx")&&!extension.equals("pdf")) throw new IllegalArgumentException("Choose xlsx or pdf.");
        ReportService.Monthly report=reports.collect(user,month);
        byte[] bytes=extension.equals("xlsx")?reports.excel(report):reports.pdf(report);
        MediaType type=extension.equals("pdf")?MediaType.APPLICATION_PDF:
            MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        return ResponseEntity.ok().contentType(type).cacheControl(CacheControl.noStore())
            .header(HttpHeaders.CONTENT_DISPOSITION,ContentDisposition.attachment()
                .filename("monthly-expenses-"+report.month()+"."+extension).build().toString()).body(bytes);
    }
}
