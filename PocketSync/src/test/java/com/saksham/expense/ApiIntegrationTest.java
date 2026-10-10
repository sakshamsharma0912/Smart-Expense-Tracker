package com.saksham.expense;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.*;
import com.lowagie.text.pdf.*;
import com.lowagie.text.pdf.parser.PdfTextExtractor;
import jakarta.servlet.http.Cookie;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.servlet.*;

@SpringBootTest(properties={
    "spring.datasource.url=jdbc:h2:mem:integration;DB_CLOSE_DELAY=-1",
    "expense.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
    "expense.bootstrap-email=","expense.migration-source="
})
@AutoConfigureMockMvc
class ApiIntegrationTest {
    @Autowired MockMvc mvc;@Autowired ObjectMapper mapper;@Autowired JdbcTemplate jdbc;
    @Autowired AdminBootstrap bootstrap;
    @BeforeEach void reset() {
        for(String table:List.of("recurring_occurrences","recurring_transactions","refresh_tokens","expense_audit","statement_inbox","expense_budgets","expense_transactions","app_users"))
            jdbc.update("DELETE FROM "+table);
    }
    record Session(String token,String id,String refresh) {}
    JsonNode json(MvcResult result) throws Exception { return mapper.readTree(result.getResponse().getContentAsByteArray()); }
    Session signup(String name) throws Exception {
        MvcResult result=mvc.perform(post("/api/register").param("name",name).param("email",name.toLowerCase()+"@example.com")
            .param("password","test-password-123").param("noticeAccepted","true").param("role","ADMIN"))
            .andExpect(status().isOk()).andReturn();
        JsonNode body=json(result);
        String cookie=result.getResponse().getHeader("Set-Cookie").split(";",2)[0].split("=",2)[1];
        return new Session(body.path("accessToken").asText(),body.path("profile").path("id").asText(),cookie);
    }
    MvcResult add(Session s,String date,String amount,String type,String tax) throws Exception {
        return mvc.perform(post("/api/transactions").header("Authorization","Bearer "+s.token)
            .param("date",date).param("description","College lunch").param("category","Food")
            .param("amount",amount).param("type",type).param("method","UPI").param("taxAmount",tax))
            .andExpect(status().isOk()).andReturn();
    }
    JsonNode state(Session s) throws Exception {
        return json(mvc.perform(get("/api/state").header("Authorization","Bearer "+s.token)).andExpect(status().isOk()).andReturn());
    }
    MvcResult smart(Session s,String csv) throws Exception {
        return mvc.perform(multipart("/api/statements/import")
            .file(new MockMultipartFile("file","statement.csv","text/csv",csv.getBytes(StandardCharsets.UTF_8)))
            .param("defaultAccount","My bank").param("defaultMethod","Bank").header("Authorization","Bearer "+s.token)).andReturn();
    }
    static final String HEADER="transaction_id,date,description,amount,direction,method,account,tax_amount\n";
    @Test void protectedApiAndStaticEntryPoint() throws Exception {
        mvc.perform(get("/")).andExpect(status().isOk()).andExpect(forwardedUrl("index.html"));
        mvc.perform(get("/index.html")).andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML));
        mvc.perform(get("/presentation.js")).andExpect(status().isOk());
        mvc.perform(get("/api/state")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/reports/monthly").param("month","2026-10")).andExpect(status().isUnauthorized());
    }
    @Test void jwtLoginCannotEscalateRoleAndRejectsTampering() throws Exception {
        Session user=signup("Alice");
        assertThat(state(user).path("profile").path("role").asText()).isEqualTo("USER");
        mvc.perform(get("/api/admin/users").header("Authorization","Bearer "+user.token)).andExpect(status().isForbidden());
        mvc.perform(get("/api/state").header("Authorization","Bearer "+user.token+"x")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/login").param("email","alice@example.com").param("password","wrong-password")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/login").param("email","ALICE@example.com").param("password","test-password-123").param("loginRole","USER"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.accessToken").isString());
    }
    @Test void refreshRotatesCookieAndRequiresSameOriginHeader() throws Exception {
        Session user=signup("Alice");Cookie old=new Cookie("expense_refresh",user.refresh);
        mvc.perform(post("/api/refresh").cookie(old)).andExpect(status().isForbidden());
        mvc.perform(post("/api/refresh").cookie(old).header("X-Requested-With","ExpenseTracker").header("Origin","https://evil.example"))
            .andExpect(status().isForbidden());
        MvcResult renewed=mvc.perform(post("/api/refresh").cookie(old).header("X-Requested-With","ExpenseTracker").header("Origin","http://localhost"))
            .andExpect(status().isOk()).andReturn();
        assertThat(renewed.getResponse().getHeader("Set-Cookie")).contains("HttpOnly","SameSite=Strict","Path=/api/refresh").doesNotContain(user.refresh);
        mvc.perform(post("/api/refresh").cookie(old).header("X-Requested-With","ExpenseTracker")).andExpect(status().isUnauthorized());
    }
    @Test void logoutAndPasswordChangeRevokeExistingJwt() throws Exception {
        Session user=signup("Alice");
        MvcResult changed=mvc.perform(put("/api/password").header("Authorization","Bearer "+user.token)
            .param("currentPassword","test-password-123").param("newPassword","replacement-password-123").param("confirmPassword","replacement-password-123"))
            .andExpect(status().isOk()).andReturn();
        mvc.perform(get("/api/state").header("Authorization","Bearer "+user.token)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/refresh").cookie(new Cookie("expense_refresh",user.refresh)).header("X-Requested-With","ExpenseTracker"))
            .andExpect(status().isUnauthorized());
        String token=json(changed).path("accessToken").asText();
        mvc.perform(post("/api/logout").header("Authorization","Bearer "+token)).andExpect(status().isOk());
        mvc.perform(get("/api/state").header("Authorization","Bearer "+token)).andExpect(status().isUnauthorized());
    }
    @Test void ownershipEnforcedOnReadUpdateDeleteAndReports() throws Exception {
        Session alice=signup("Alice"),bob=signup("Bob");
        String id=json(add(alice,"2026-10-10","120.50","expense","20.00")).path("transactions").get(0).path("id").asText();
        assertThat(state(bob).path("transactions").size()).isZero();
        mvc.perform(delete("/api/transactions/"+id).header("Authorization","Bearer "+bob.token)).andExpect(status().isNotFound());
        mvc.perform(put("/api/transactions/"+id).header("Authorization","Bearer "+bob.token)).andExpect(status().isNotFound());
        assertThat(state(alice).path("transactions").size()).isEqualTo(1);
        byte[] empty=mvc.perform(get("/api/reports/monthly").param("month","2026-10").header("Authorization","Bearer "+bob.token))
            .andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
        try(XSSFWorkbook book=new XSSFWorkbook(new ByteArrayInputStream(empty))) {
            assertThat(book.getSheet("Transactions").getLastRowNum()).isZero();
        }
    }
    @Test void adminNeedsSharingAndGetsReadOnlyWorkspace() throws Exception {
        Session alice=signup("Alice");
        bootstrap.create("owner@example.com","Owner","owner-password-123");
        String admin=json(mvc.perform(post("/api/login").param("email","owner@example.com").param("password","owner-password-123").param("loginRole","ADMIN"))
            .andExpect(status().isOk()).andReturn()).path("accessToken").asText();
        mvc.perform(get("/api/admin/users/"+alice.id+"/state").header("Authorization","Bearer "+admin)).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/users").header("Authorization","Bearer "+admin))
            .andExpect(status().isOk()).andExpect(jsonPath("$.users[0].spent").isEmpty());
        mvc.perform(put("/api/profile").header("Authorization","Bearer "+alice.token).param("name","Alice").param("share","true")).andExpect(status().isOk());
        mvc.perform(get("/api/admin/users/"+alice.id+"/state").header("Authorization","Bearer "+admin))
            .andExpect(status().isOk()).andExpect(jsonPath("$.viewer.readOnly").value(true));
        mvc.perform(put("/api/profile").header("Authorization","Bearer "+alice.token).param("name","Alice").param("share","false")).andExpect(status().isOk());
        mvc.perform(get("/api/admin/users/"+alice.id+"/state").header("Authorization","Bearer "+admin)).andExpect(status().isForbidden());
    }
    @Test void smartImportCategorizesIsAtomicAndDeduplicates() throws Exception {
        Session user=signup("Alice");
        String csv=HEADER+"REF1,2026-10-01,Zomato order,250.00,DEBIT,UPI,My bank,20.00\n"+
            "REF2,2026-10-02,Salary,2000.00,CREDIT,Bank,My bank,0\n";
        MvcResult first=smart(user,csv);assertThat(first.getResponse().getStatus()).isEqualTo(200);
        JsonNode payload=json(first);
        assertThat(payload.path("imported").asInt()).isEqualTo(2);
        assertThat(payload.path("state").path("transactions").toString()).contains("Food","income","20.00");
        assertThat(json(smart(user,csv)).path("duplicates").asInt()).isEqualTo(2);
        assertThat(smart(user,csv.replace("250.00","251.00")).getResponse().getStatus()).isEqualTo(400);
        String malformed=HEADER+"REF3,2026-10-03,Uber,90,DEBIT,UPI,My bank,0\n"+
            "REF4,2026-02-30,Invalid date,100,DEBIT,UPI,My bank,0\n";
        assertThat(smart(user,malformed).getResponse().getStatus()).isEqualTo(400);
        assertThat(state(user).path("transactions").size()).isEqualTo(2);
    }
    @Test void splitStatementAmountsBomDatesAndUnicodeSupported() throws Exception {
        Session user=signup("Alice");
        String csv="\uFEFFUTR,Transaction Date,Narration,Withdrawal,Deposit,Method\nR9,02/10/2026,\"Café, lunch\",\"1,234.50\",0,upi\n";
        assertThat(smart(user,csv).getResponse().getStatus()).isEqualTo(200);
        JsonNode t=state(user).path("transactions").get(0);
        assertThat(t.path("date").asText()).isEqualTo("2026-10-02");
        assertThat(t.path("amount").asText()).isEqualTo("1234.50");
        assertThat(t.path("description").asText()).isEqualTo("Café, lunch");
        assertThat(smart(user,csv.replace(",0,upi",",20,upi")).getResponse().getStatus()).isEqualTo(400);
    }
    @Test void reviewInboxCanMatchOnceWithoutDoubleCounting() throws Exception {
        Session user=signup("Alice");
        String id=json(add(user,"2026-10-01","250","expense","0")).path("transactions").get(0).path("id").asText();
        String csv=HEADER+"R1,2026-10-01,Zomato order,250,DEBIT,UPI,My bank,20\n";
        mvc.perform(post("/api/import/preview").header("Authorization","Bearer "+user.token).param("csv",csv))
            .andExpect(status().isOk()).andExpect(jsonPath("$.newCount").value(1));
        assertThat(state(user).path("inbox").size()).isZero();
        JsonNode payload=json(mvc.perform(post("/api/import/commit").header("Authorization","Bearer "+user.token).param("csv",csv))
            .andExpect(status().isOk()).andReturn());
        String incoming=payload.path("state").path("inbox").get(0).path("id").asText();
        mvc.perform(put("/api/inbox/"+incoming).header("Authorization","Bearer "+user.token).param("action","match").param("transactionId",id))
            .andExpect(status().isOk()).andExpect(jsonPath("$.transactions.length()").value(1)).andExpect(jsonPath("$.transactions[0].taxAmount").value("20.00"));
        mvc.perform(put("/api/inbox/"+incoming).header("Authorization","Bearer "+user.token).param("action","match").param("transactionId",id))
            .andExpect(status().isBadRequest());
    }
    @Test void moneyAndTaxValidationPreventsInvalidRecords() throws Exception {
        Session user=signup("Alice");
        for(String amount:List.of("-1","1.001","1000000000","NaN","0"))
            mvc.perform(post("/api/transactions").header("Authorization","Bearer "+user.token)
                .param("date","2026-10-10").param("description","Invalid").param("category","Food").param("amount",amount).param("type","expense").param("method","UPI"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/transactions").header("Authorization","Bearer "+user.token)
            .param("date","2026-10-10").param("description","Invalid tax").param("category","Food").param("amount","100").param("taxAmount","101").param("type","expense").param("method","UPI"))
            .andExpect(status().isBadRequest());
        assertThat(state(user).path("transactions").size()).isZero();
    }
    @Test void excelAndPdfDownloadsContainMonthTotalsAndRecordedTax() throws Exception {
        Session user=signup("Alice");
        add(user,"2026-10-10","120.50","expense","20.00");add(user,"2026-10-11","1000","income","0");
        add(user,"2026-10-12","50","refund","0");add(user,"2026-10-13","500","transfer","0");add(user,"2026-09-30","999","expense","0");
        MvcResult result=mvc.perform(get("/api/reports/monthly").param("month","2026-10").param("format","xlsx").header("Authorization","Bearer "+user.token))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store")).andReturn();
        try(XSSFWorkbook book=new XSSFWorkbook(new ByteArrayInputStream(result.getResponse().getContentAsByteArray()))) {
            assertThat(book.getSheet("Transactions").getLastRowNum()).isEqualTo(4);
            assertThat(book.getSheet("Monthly summary").getRow(5).getCell(1).getNumericCellValue()).isEqualTo(120.5);
            assertThat(book.getSheet("Monthly summary").getRow(9).getCell(1).getNumericCellValue()).isEqualTo(929.5);
            assertThat(book.getSheet("Monthly summary").getRow(10).getCell(1).getNumericCellValue()).isEqualTo(20);
        }
        byte[] pdf=mvc.perform(get("/api/reports/monthly").param("month","2026-10").param("format","pdf").header("Authorization","Bearer "+user.token))
            .andExpect(status().isOk()).andExpect(content().contentType(MediaType.APPLICATION_PDF)).andReturn().getResponse().getContentAsByteArray();
        try(PdfReader reader=new PdfReader(pdf)) {
            String text=new PdfTextExtractor(reader).getTextFromPage(1);
            assertThat(text).contains("Monthly expense summary","2026-10","120.50","20.00","INR");
        }
        mvc.perform(get("/api/reports/monthly").param("month","2026-99").header("Authorization","Bearer "+user.token)).andExpect(status().isBadRequest());
    }
}
