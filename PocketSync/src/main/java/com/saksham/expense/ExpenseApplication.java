package com.saksham.expense;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.annotation.EnableScheduling;
import java.time.*;
@SpringBootApplication
@EnableScheduling
public class ExpenseApplication {
    public static void main(String[] args) { SpringApplication.run(ExpenseApplication.class, args); }
    @Bean Clock billingClock() { return Clock.system(ZoneId.of("Asia/Kolkata")); }
}
