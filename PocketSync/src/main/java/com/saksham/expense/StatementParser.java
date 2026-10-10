package com.saksham.expense;

import java.io.*;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.*;
import java.util.*;
import org.apache.commons.csv.*;
import org.springframework.stereotype.Component;

/** Bank CSV normalization is separate from persistence so the entire file is validated first. */
@Component
class StatementParser {
    static final int MAX_BYTES=2*1024*1024, MAX_ROWS=5000;
    record Incoming(String key,String reference,String account,LocalDate date,String description,
        BigDecimal amount,String direction,String method,String category,BigDecimal taxAmount) {}

    List<CSVRecord> records(String input) {
        if(input==null || input.isBlank() || input.getBytes(StandardCharsets.UTF_8).length>MAX_BYTES)
            throw new IllegalArgumentException("Choose a nonempty UTF-8 CSV up to 2 MB.");
        if(input.startsWith("\uFEFF")) input=input.substring(1);
        try(CSVParser parser=CSVFormat.DEFAULT.builder().setIgnoreEmptyLines(true).setTrim(true).get().parse(new StringReader(input))) {
            List<CSVRecord> rows=parser.getRecords();
            if(rows.size()>MAX_ROWS+1) throw new IllegalArgumentException("Import at most 5,000 transactions at a time.");
            return rows;
        } catch(IOException | UncheckedIOException e) {
            throw new IllegalArgumentException("Malformed CSV. Check quotes, delimiters and line endings.");
        }
    }
    List<Incoming> parse(String input,Map<String,String> options) {
        List<CSVRecord> rows=records(input);
        if(rows.size()<2) throw new IllegalArgumentException("The CSV needs a header and at least one transaction.");
        CSVRecord header=rows.get(0);
        int ref=column(options,"id",header,"transaction_id","reference","utr","ref no","reference no","transaction reference");
        int date=column(options,"date",header,"date","transaction date","txn date","value date");
        int description=column(options,"description",header,"description","narration","particulars","details");
        int amount=column(options,"amount",header,"amount","transaction amount");
        int direction=column(options,"direction",header,"direction","type","dr/cr","debit credit");
        int debit=column(options,"debit",header,"debit","withdrawal","withdrawals","debit amount","withdrawal amount");
        int credit=column(options,"credit",header,"credit","deposit","deposits","credit amount","deposit amount");
        int method=column(options,"method",header,"method","payment_method","payment method");
        int account=column(options,"account",header,"account","account label");
        int tax=column(options,"tax",header,"tax_amount","tax amount","included tax");
        int currency=column(options,"currency",header,"currency");
        boolean split="split".equals(options.getOrDefault("amountMode",debit>=0||credit>=0?"split":"single"));
        if(ref<0 || date<0 || description<0 || (!split&&(amount<0||direction<0)) || (split&&debit<0&&credit<0))
            throw new IllegalArgumentException("Map reference, date, description, and amount + direction or debit/credit columns.");
        String fallbackAccount=Validation.text(options.getOrDefault("defaultAccount","My bank"),"Account label",80,true);
        String fallbackMethod=payment(options.getOrDefault("defaultMethod","Bank"));
        List<Incoming> result=new ArrayList<>();
        for(int n=1;n<rows.size();n++) {
            try {
                CSVRecord row=rows.get(n);
                if(row.size()!=header.size()) throw new IllegalArgumentException("Column count differs from the header.");
                String unit=cell(row,currency);
                if(!unit.isEmpty()&&!unit.equalsIgnoreCase("INR"))
                    throw new IllegalArgumentException("Only INR source amounts are supported; convert foreign amounts before importing.");
                String reference=Validation.text(cell(row,ref),"Reference",120,true);
                String label=cell(row,account);if(label.isEmpty()) label=fallbackAccount;
                label=Validation.text(label,"Account label",80,true);
                String text=Validation.text(cell(row,description),"Description",100,true);
                LocalDate occurred=date(cell(row,date),options.getOrDefault("dateFormat","AUTO"));
                BigDecimal value;String flow;
                if(split) {
                    BigDecimal dr=bankMoney(cell(row,debit),true),cr=bankMoney(cell(row,credit),true);
                    if((dr.signum()>0)==(cr.signum()>0)) throw new IllegalArgumentException("Exactly one debit or credit amount must be positive.");
                    value=dr.signum()>0?dr:cr;flow=dr.signum()>0?"DEBIT":"CREDIT";
                } else {
                    value=bankMoney(cell(row,amount),false);
                    flow=switch(cell(row,direction).toUpperCase(Locale.ROOT)) {
                        case "D","DR","DEBIT" -> "DEBIT";
                        case "C","CR","CREDIT" -> "CREDIT";
                        default -> throw new IllegalArgumentException("Direction must be DEBIT/DR or CREDIT/CR.");
                    };
                }
                String pm=cell(row,method);pm=payment(pm.isEmpty()?fallbackMethod:pm);
                BigDecimal recordedTax=bankMoney(cell(row,tax),true);
                if(recordedTax.compareTo(value)>0 || (flow.equals("CREDIT")&&recordedTax.signum()>0))
                    throw new IllegalArgumentException("Tax must be an included component of a debit expense.");
                if(smartType(flow,text).equals("transfer") && recordedTax.signum()>0)
                    throw new IllegalArgumentException("A transfer cannot have recorded expense tax.");
                // This exact, case-sensitive key is compatible with V4 imports.
                result.add(new Incoming(Validation.hash(label+"\u0000"+reference),reference,label,occurred,text,
                    value,flow,pm,category(text),recordedTax));
            } catch(IllegalArgumentException e) { throw new IllegalArgumentException("Row "+(n+1)+": "+e.getMessage()); }
        }
        return result;
    }
    static int column(Map<String,String> options,String key,CSVRecord header,String... aliases) {
        String selected=options.get("map_"+key);
        if(selected!=null&&!selected.isBlank()) {
            try {
                int index=Integer.parseInt(selected);
                if(index<-1||index>=header.size()) throw new NumberFormatException();
                return index;
            } catch(NumberFormatException e) { throw new IllegalArgumentException("Invalid "+key+" column mapping."); }
        }
        for(String alias:aliases) for(int i=0;i<header.size();i++)
            if(normalize(header.get(i)).equals(normalize(alias))) return i;
        return -1;
    }
    static String normalize(String value) { return value.toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]",""); }
    static String cell(CSVRecord row,int index) { return index<0?"":row.get(index).trim(); }
    static BigDecimal bankMoney(String value,boolean allowZero) {
        String input=value.trim().replaceFirst("(?i)^(?:INR|₹)\\s*","");
        if(allowZero&&(input.isEmpty()||input.equals("-"))) return new BigDecimal("0.00");
        if(!input.matches("(?:\\d{1,9}|\\d{1,3}(?:,\\d{2})*,\\d{3}|\\d{1,3}(?:,\\d{3})+)(?:\\.\\d{1,2})?"))
            throw new IllegalArgumentException("Use a positive INR amount, with at most two decimal places.");
        return Validation.money(input.replace(",",""),allowZero);
    }
    static LocalDate date(String input,String format) {
        try {
            String result=input;
            if(format.equals("DMY") || (format.equals("AUTO")&&input.matches("\\d{2}[/-]\\d{2}[/-]\\d{4}")))
                result=LocalDate.parse(input.replace('-','/'),DateTimeFormatter.ofPattern("dd/MM/uuuu")
                    .withResolverStyle(ResolverStyle.STRICT)).toString();
            else if(!Set.of("AUTO","ISO").contains(format)) throw new IllegalArgumentException();
            return Validation.date(result);
        } catch(Exception e) { throw new IllegalArgumentException("Use YYYY-MM-DD or DD/MM/YYYY dates."); }
    }
    static String payment(String input) {
        return Validation.METHODS.stream().filter(m->m.equalsIgnoreCase(input)).findFirst()
            .orElseThrow(()->new IllegalArgumentException("Payment method must be Cash, UPI, Card, Bank or Other."));
    }
    static String category(String description) {
        String value=description.toLowerCase(Locale.ROOT);
        String[][] rules={
            {"Streaming","netflix|prime video|hotstar|disney|youtube premium"},
            {"Music","spotify|apple music|youtube music"},
            {"Cloud Storage","icloud|google one|dropbox|cloud storage"},
            {"Software","adobe|microsoft 365|office 365|notion|figma|github|software"},
            {"Fitness","gym|fitness|cult.fit"},
            {"Memberships","membership|club dues"},
            {"Subscriptions","subscription|recurring"},
            {"Food","swiggy|zomato|restaurant|canteen|grocery|groceries|cafe|coffee|chai|lunch"},
            {"Travel","uber|ola\\b|railway|irctc|metro|bus\\b|petrol|fuel|flight"},
            {"Shopping","amazon|flipkart|myntra|shopping|clothing"},
            {"Education","tuition|college|school|course|udemy|coursera|books"},
            {"Bills","electricity|water bill|recharge|broadband|rent|utility"},
            {"Health","hospital|pharmacy|medicine|doctor|clinic"},
            {"Entertainment","cinema|movie|concert"}
        };
        for(String[] rule:rules) if(java.util.regex.Pattern.compile(rule[1]).matcher(value).find()) return rule[0];
        return "Other";
    }
    static String smartType(String direction,String description) {
        String text=description.toLowerCase(Locale.ROOT);
        if(text.contains("self transfer")||text.contains("own account")) return "transfer";
        return direction.equals("DEBIT")?"expense":text.contains("refund")?"refund":"income";
    }
}
