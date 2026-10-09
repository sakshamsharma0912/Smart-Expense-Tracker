package tracker;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.Arrays;
import java.util.Map;

/** Validates form fields, calendar dates and exact decimal money. */
public final class Validation {

    public static final String[] CATEGORIES = {
        "Food",
        "Travel",
        "Shopping",
        "Education",
        "Bills",
        "Health",
        "Entertainment",
        "Other",
    };
    public static final String[] METHODS = { "Cash", "UPI", "Card", "Bank", "Other" };
    public static final int MAX_ROWS = 10000;

    private Validation() {}

    static String text(Map<String, String> f, String key, int max, boolean required) {
        String v = f.getOrDefault(key, "").trim();
        if (
            (required && v.isEmpty()) ||
            v.length() > max ||
            v.chars().anyMatch(c -> c < 32 && c != '\n' && c != '\r' && c != '\t')
        ) throw new IllegalArgumentException("Check " + key + " (maximum " + max + " characters).");
        return v;
    }

    static String choice(Map<String, String> f, String key, String... choices) {
        String v = f.getOrDefault(key, "");
        if (!Arrays.asList(choices).contains(v)) throw new IllegalArgumentException(
            "Choose a valid " + key + "."
        );
        return v;
    }

    static String date(String v) {
        try {
            if (!v.matches("\\d{4}-\\d{2}-\\d{2}")) throw new Exception();
            LocalDate d = LocalDate.parse(v);
            if (d.getYear() < 1900 || d.getYear() > 2100) throw new Exception();
            return d.toString();
        } catch (Exception e) {
            throw new IllegalArgumentException("Use a valid date between 1900 and 2100.");
        }
    }

    static String month(String v) {
        try {
            if (!v.matches("\\d{4}-\\d{2}")) throw new Exception();
            date(v + "-01");
            return YearMonth.parse(v).toString();
        } catch (Exception e) {
            throw new IllegalArgumentException("Choose a valid month.");
        }
    }

    static String money(String v) {
        if (
            v == null || !v.trim().matches("[0-9]+(?:\\.[0-9]{1,2})?")
        ) throw new IllegalArgumentException(
            "Use a positive amount with up to two decimal places."
        );
        BigDecimal n = new BigDecimal(v.trim());
        if (
            n.signum() <= 0 || n.compareTo(new BigDecimal("999999999.99")) > 0
        ) throw new IllegalArgumentException("Amount must be 0.01 to 999999999.99.");
        return n.setScale(2, RoundingMode.UNNECESSARY).toPlainString();
    }
}
