package com.saksham.expense;

import java.math.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import java.time.*;
import java.util.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

final class Validation {
    static final Set<String> CATEGORIES=Set.of("Food","Travel","Shopping","Education","Bills","Health","Entertainment","Subscriptions","Streaming","Music","Software","Cloud Storage","Fitness","Memberships","Other");
    static final Set<String> METHODS=Set.of("Cash","UPI","Card","Bank","Other");
    static final Set<String> TYPES=Set.of("expense","income","refund","transfer");
    static String text(String value,String label,int max,boolean required) {
        String result=value==null?"":value.trim();
        if ((required && result.isEmpty()) || result.length()>max || result.indexOf('\0')>=0)
            throw new IllegalArgumentException(label+" must contain "+(required?"1":"0")+"–"+max+" characters.");
        return result;
    }
    static BigDecimal money(String value,boolean allowZero) {
        String input=value==null?"":value.trim();
        if (!input.matches("\\d{1,9}(?:\\.\\d{1,2})?"))
            throw new IllegalArgumentException("Use an amount with at most two decimals, up to 999999999.99.");
        BigDecimal number=new BigDecimal(input).setScale(2,RoundingMode.UNNECESSARY);
        if (number.signum()<0 || (!allowZero && number.signum()==0))
            throw new IllegalArgumentException("Amount must be positive.");
        return number;
    }
    static LocalDate date(String value) {
        try {
            if (value==null || !value.matches("\\d{4}-\\d{2}-\\d{2}")) throw new Exception();
            LocalDate date=LocalDate.parse(value);
            if (date.getYear()<1900 || date.getYear()>2100) throw new Exception();
            return date;
        } catch(Exception e) { throw new IllegalArgumentException("Use a valid date between 1900 and 2100."); }
    }
    static YearMonth month(String value) {
        try {
            if (value==null || !value.matches("\\d{4}-\\d{2}")) throw new Exception();
            YearMonth result=YearMonth.parse(value);
            if (result.getYear()<1900 || result.getYear()>2100) throw new Exception();
            return result;
        } catch(Exception e) { throw new IllegalArgumentException("Use a valid YYYY-MM report month."); }
    }
    static String hash(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch(NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    static String token() {
        byte[] bytes=new byte[32]; new SecureRandom().nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }
    static ResponseStatusException denied() { return new ResponseStatusException(HttpStatus.FORBIDDEN,"Access denied."); }
    static ResponseStatusException missing() { return new ResponseStatusException(HttpStatus.NOT_FOUND,"Record not found in your account."); }
}
