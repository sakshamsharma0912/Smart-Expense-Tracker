package com.saksham.expense;

import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import com.fasterxml.jackson.databind.*;
import java.time.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.*;
import org.springframework.context.annotation.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

@SpringBootTest(properties={"spring.datasource.url=jdbc:h2:mem:pocketsync;DB_CLOSE_DELAY=-1",
    "expense.jwt-secret=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=","expense.bootstrap-email=","expense.migration-source=",
    "expense.recurring-delay-ms=86400000"})
@AutoConfigureMockMvc
@Import(PocketSyncTest.FixedClock.class)
class PocketSyncTest {
    @TestConfiguration static class FixedClock {
        @Bean @Primary Clock fixedBillingClock() {return Clock.fixed(Instant.parse("2026-10-10T22:00:00Z"),ZoneId.of("Asia/Kolkata"));}
    }
    @Autowired MockMvc mvc;@Autowired ObjectMapper mapper;@Autowired JdbcTemplate jdbc;
    @Autowired RecurringScheduler scheduler;@Autowired AdminBootstrap bootstrap;
    @BeforeEach void reset() {
        for(String table:List.of("recurring_occurrences","recurring_transactions","refresh_tokens","expense_audit","statement_inbox","expense_budgets","expense_transactions","app_users")) jdbc.update("DELETE FROM "+table);
    }
    record Session(String token,String id) {}
    JsonNode json(MvcResult result) throws Exception {return mapper.readTree(result.getResponse().getContentAsByteArray());}
    Session signup(String name) throws Exception {
        JsonNode result=json(mvc.perform(post("/api/register").param("name",name).param("email",name+"@example.com")
            .param("password","test-password-123").param("noticeAccepted","true")).andExpect(status().isOk()).andReturn());
        return new Session(result.path("accessToken").asText(),result.path("profile").path("id").asText());
    }
    JsonNode state(Session s) throws Exception {return json(mvc.perform(get("/api/state").header("Authorization","Bearer "+s.token)).andExpect(status().isOk()).andReturn());}
    Map<String,String> fields(String start,boolean automatic) {
        Map<String,String> f=new LinkedHashMap<>(Map.of("description","Music subscription","plan","Student plan","amount","99.50","category","Music","type","expense","method","Card","frequency","monthly","startDate",start,"autoPost",String.valueOf(automatic)));
        f.put("endDate","");f.put("taxAmount","10.00");f.put("notes","Monthly service");return f;
    }
    MockHttpServletRequestBuilder form(MockHttpServletRequestBuilder request,Session s,Map<String,String> fields) {
        request.header("Authorization","Bearer "+s.token);fields.forEach(request::param);return request;
    }
    JsonNode create(Session s,String start,boolean automatic) throws Exception {
        return json(mvc.perform(form(post("/api/recurring"),s,fields(start,automatic))).andExpect(status().isOk()).andReturn());
    }
    JsonNode record(Session s,String id,String date) throws Exception {
        return json(mvc.perform(post("/api/recurring/"+id+"/record").header("Authorization","Bearer "+s.token).param("dueDate",date)).andExpect(status().isOk()).andReturn());
    }
    @Test void manualBillingNeedsExplicitRecordAndSameDateCannotBeRecordedTwice() throws Exception {
        Session s=signup("alice");JsonNode created=create(s,"2026-09-30",false);String id=created.path("recurring").get(0).path("id").asText();
        assertThat(state(s).path("transactions").size()).isZero();
        JsonNode posted=record(s,id,"2026-09-30");
        assertThat(posted.path("transactions").size()).isEqualTo(1);
        assertThat(posted.path("transactions").get(0).path("source").asText()).isEqualTo("recurring");
        assertThat(posted.path("transactions").get(0).path("taxAmount").asText()).isEqualTo("10.00");
        assertThat(posted.path("recurring").get(0).path("nextDate").asText()).isEqualTo("2026-10-30");
        mvc.perform(post("/api/recurring/"+id+"/record").header("Authorization","Bearer "+s.token).param("dueDate","2026-09-30")).andExpect(status().isBadRequest());
        assertThat(state(s).path("transactions").size()).isEqualTo(1);
    }
    @Test void autoBillingCatchesUpOnlyDueDatesAndKeepsDeletedOccurrencesRecorded() throws Exception {
        Session s=signup("alice");create(s,"2026-09-11",true);
        JsonNode first=state(s);assertThat(first.path("transactions").size()).isEqualTo(2);
        assertThat(first.path("recurring").get(0).path("nextDate").asText()).isEqualTo("2026-11-11");
        String tx=first.path("transactions").get(0).path("id").asText();
        mvc.perform(delete("/api/transactions/"+tx).header("Authorization","Bearer "+s.token)).andExpect(status().isOk());
        assertThat(state(s).path("transactions").size()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM recurring_occurrences",Integer.class)).isEqualTo(2);
        mvc.perform(post("/api/recurring/sync").header("Authorization","Bearer "+s.token)).andExpect(status().isOk()).andExpect(jsonPath("$.recorded").value(0));
    }
    @Test void futureScheduleAndExpiredEndDateNeverCreateLedgerEntries() throws Exception {
        Session s=signup("alice");create(s,"2026-11-11",true);
        Map<String,String> f=fields("2026-09-11",true);f.put("endDate","2026-09-11");
        mvc.perform(form(post("/api/recurring"),s,f)).andExpect(status().isOk());
        JsonNode result=state(s);assertThat(result.path("transactions").size()).isEqualTo(1);
        assertThat(result.path("transactions").get(0).path("date").asText()).isEqualTo("2026-09-11");
        assertThat(state(s).path("transactions").size()).isEqualTo(1);
    }
    @Test void pausedPeriodsAreSkippedAndTodayRemainsDueOnResume() throws Exception {
        Session s=signup("alice");String id=create(s,"2026-09-11",false).path("recurring").get(0).path("id").asText();
        mvc.perform(put("/api/recurring/"+id+"/status").header("Authorization","Bearer "+s.token).param("active","false")).andExpect(status().isOk());
        mvc.perform(post("/api/recurring/"+id+"/record").header("Authorization","Bearer "+s.token).param("dueDate","2026-09-11")).andExpect(status().isBadRequest());
        JsonNode resumed=json(mvc.perform(put("/api/recurring/"+id+"/status").header("Authorization","Bearer "+s.token).param("active","true")).andExpect(status().isOk()).andReturn());
        assertThat(resumed.path("recurring").get(0).path("nextDate").asText()).isEqualTo("2026-10-11");
        assertThat(resumed.path("transactions").size()).isZero();record(s,id,"2026-10-11");
    }
    @Test void deletingScheduleRetainsItsHistoricalTransactions() throws Exception {
        Session s=signup("alice");String id=create(s,"2026-10-11",false).path("recurring").get(0).path("id").asText();record(s,id,"2026-10-11");
        JsonNode deleted=json(mvc.perform(delete("/api/recurring/"+id).header("Authorization","Bearer "+s.token)).andExpect(status().isOk()).andReturn());
        assertThat(deleted.path("recurring").size()).isZero();assertThat(deleted.path("transactions").size()).isEqualTo(1);
        mvc.perform(put("/api/recurring/"+id+"/status").header("Authorization","Bearer "+s.token).param("active","true")).andExpect(status().isNotFound());
    }
    @Test void amountAndPlanCanChangeWithoutRewritingPreviousBills() throws Exception {
        Session s=signup("alice");String id=create(s,"2026-10-11",false).path("recurring").get(0).path("id").asText();record(s,id,"2026-10-11");
        Map<String,String> f=fields("2026-10-11",false);f.put("amount","199.00");f.put("plan","Family");
        JsonNode updated=json(mvc.perform(form(put("/api/recurring/"+id),s,f)).andExpect(status().isOk()).andReturn());
        assertThat(updated.path("recurring").get(0).path("amount").asText()).isEqualTo("199.00");
        assertThat(updated.path("transactions").get(0).path("amount").asText()).isEqualTo("99.50");
        f.put("frequency","yearly");mvc.perform(form(put("/api/recurring/"+id),s,f)).andExpect(status().isBadRequest());
        assertThat(state(s).path("recurring").get(0).path("frequency").asText()).isEqualTo("monthly");
    }
    @Test void everyScheduleMutationIsScopedToTheAuthenticatedOwner() throws Exception {
        Session a=signup("alice"),b=signup("bob");String id=create(a,"2026-10-11",false).path("recurring").get(0).path("id").asText();
        assertThat(state(b).path("recurring").size()).isZero();
        mvc.perform(form(put("/api/recurring/"+id),b,fields("2026-10-11",false))).andExpect(status().isNotFound());
        mvc.perform(delete("/api/recurring/"+id).header("Authorization","Bearer "+b.token)).andExpect(status().isNotFound());
        mvc.perform(put("/api/recurring/"+id+"/status").header("Authorization","Bearer "+b.token).param("active","false")).andExpect(status().isNotFound());
        mvc.perform(post("/api/recurring/"+id+"/record").header("Authorization","Bearer "+b.token).param("dueDate","2026-10-11")).andExpect(status().isNotFound());
        assertThat(state(a).path("recurring").size()).isEqualTo(1);
    }
    @Test void budgetDeletionIsOwnerScopedAndHistoricalMonthsStayIndependent() throws Exception {
        Session a=signup("alice"),b=signup("bob");
        for(String month:List.of("2026-08","2026-09","2026-10")) mvc.perform(form(put("/api/budgets"),a,Map.of("month",month,"category","Overall","amount","1000"))).andExpect(status().isOk());
        JsonNode budgets=state(a).path("budgets");String id=budgets.get(0).path("id").asText();
        mvc.perform(delete("/api/budgets/"+id).header("Authorization","Bearer "+b.token)).andExpect(status().isNotFound());
        mvc.perform(delete("/api/budgets/"+id).header("Authorization","Bearer "+a.token)).andExpect(status().isOk()).andExpect(jsonPath("$.budgets.length()").value(2));
        assertThat(state(b).path("budgets").size()).isZero();
    }
    @Test void invalidSchedulesAreRejectedWithoutSavingPartialData() throws Exception {
        Session s=signup("alice");
        Map<String,String> bad=Map.of("amount","1.001","frequency","daily","category","Unknown","startDate","2026-02-30","endDate","2026-01-01","autoPost","yes","type","refund","taxAmount","100.00");
        for(var e:bad.entrySet()) {Map<String,String> f=fields("2026-10-11",false);f.put(e.getKey(),e.getValue());mvc.perform(form(post("/api/recurring"),s,f)).andExpect(status().isBadRequest());}
        assertThat(state(s).path("recurring").size()).isZero();
    }
    @Test void recurringIncomeIsRecordedAsIncomeAndNeverExpenseTax() throws Exception {
        Session s=signup("alice");Map<String,String> f=fields("2026-10-11",true);f.put("type","income");
        mvc.perform(form(post("/api/recurring"),s,f)).andExpect(status().isBadRequest());f.put("taxAmount","0");
        mvc.perform(form(post("/api/recurring"),s,f)).andExpect(status().isOk());
        assertThat(state(s).path("transactions").get(0).path("type").asText()).isEqualTo("income");
    }
    @Test void backgroundProcessorRecordsAutomaticallyWithoutAnyBrowserRequest() throws Exception {
        Session s=signup("alice");create(s,"2026-10-11",true);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM expense_transactions",Integer.class)).isZero();
        scheduler.process();scheduler.process();
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM expense_transactions",Integer.class)).isEqualTo(1);
    }
    @Test void newAssetsArePublicWhileScheduleApisAreProtected() throws Exception {
        mvc.perform(get("/pocket.js")).andExpect(status().isOk());mvc.perform(get("/pocketsync.css")).andExpect(status().isOk());
        mvc.perform(post("/api/recurring")).andExpect(status().isUnauthorized());mvc.perform(post("/api/recurring/sync")).andExpect(status().isUnauthorized());
    }
    @Test void monthEndAnchorsAndLeapYearsDoNotDrift() {
        LocalDate anchor=LocalDate.parse("2024-01-31");
        LocalDate feb=RecurringService.nextAfter(anchor,anchor,"monthly");assertThat(feb.toString()).isEqualTo("2024-02-29");
        assertThat(RecurringService.nextAfter(anchor,feb,"monthly").toString()).isEqualTo("2024-03-31");
        LocalDate leap=LocalDate.parse("2024-02-29");LocalDate next=RecurringService.nextAfter(leap,leap,"yearly");
        assertThat(next.toString()).isEqualTo("2025-02-28");
        assertThat(RecurringService.nextAfter(anchor,anchor,"quarterly").toString()).isEqualTo("2024-04-30");
    }
    @Test void profileSavePreservesSharingWhenOptionIsAbsent() throws Exception {
        Session s=signup("alice");mvc.perform(put("/api/profile").header("Authorization","Bearer "+s.token).param("name","Alice New").param("share","true")).andExpect(status().isOk());
        mvc.perform(put("/api/profile").header("Authorization","Bearer "+s.token).param("name","Alice Updated")).andExpect(status().isOk()).andExpect(jsonPath("$.profile.share").value(true)).andExpect(jsonPath("$.profile.name").value("Alice Updated"));
    }
    @Test void statementCategoriesRecognizeSubscriptionMerchantsPrecisely() {
        assertThat(StatementParser.category("Netflix Monthly")).isEqualTo("Streaming");
        assertThat(StatementParser.category("Spotify student")).isEqualTo("Music");
        assertThat(StatementParser.category("iCloud storage")).isEqualTo("Cloud Storage");
        assertThat(StatementParser.category("Adobe Creative Cloud")).isEqualTo("Software");
        assertThat(StatementParser.category("Gym membership")).isEqualTo("Fitness");
        assertThat(StatementParser.category("Cinema ticket")).isEqualTo("Entertainment");
    }
    @Test void refreshedTokenRetainsOwnerIdentityAndAdminRole() throws Exception {
        bootstrap.create("owner@example.com","Owner","test-password-123");
        MvcResult login=mvc.perform(post("/api/login").param("email","owner@example.com").param("password","test-password-123").param("loginRole","ADMIN")).andExpect(status().isOk()).andReturn();
        String raw=login.getResponse().getHeader("Set-Cookie").split(";",2)[0].split("=",2)[1];
        MvcResult refreshed=mvc.perform(post("/api/refresh").cookie(new jakarta.servlet.http.Cookie("expense_refresh",raw)).header("X-Requested-With","ExpenseTracker")).andExpect(status().isOk()).andReturn();
        JsonNode result=json(refreshed);
        assertThat(result.path("profile").path("id").asText()).isEqualTo(json(login).path("profile").path("id").asText());
        assertThat(result.path("profile").path("role").asText()).isEqualTo("ADMIN");
        mvc.perform(get("/api/admin/users").header("Authorization","Bearer "+result.path("accessToken").asText())).andExpect(status().isOk());
        mvc.perform(post("/api/logout").header("Authorization","Bearer "+result.path("accessToken").asText())).andExpect(status().isOk());
    }

}
