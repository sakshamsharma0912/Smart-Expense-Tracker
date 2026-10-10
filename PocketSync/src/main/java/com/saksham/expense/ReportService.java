package com.saksham.expense;

import com.lowagie.text.*;
import com.lowagie.text.pdf.*;
import java.awt.Color;
import java.io.*;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.util.CellRangeAddress;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
class ReportService {
    private final TransactionRepository transactions;
    ReportService(TransactionRepository transactions) { this.transactions=transactions; }
    record Monthly(String name,YearMonth month,java.util.List<Transaction> rows,BigDecimal expenses,BigDecimal income,
        BigDecimal refunds,BigDecimal transfers,BigDecimal tax,Map<String,BigDecimal> categories) {
        BigDecimal net() { return income.add(refunds).subtract(expenses); }
    }
    @Transactional(readOnly=true)
    Monthly collect(User user,String selected) {
        YearMonth month=Validation.month(selected);
        var rows=transactions.findByUserIdAndDateBetweenOrderByDateAsc(user.id,month.atDay(1),month.atEndOfMonth());
        Map<String,BigDecimal> categories=new TreeMap<>();
        BigDecimal expense=BigDecimal.ZERO,income=BigDecimal.ZERO,refund=BigDecimal.ZERO,transfer=BigDecimal.ZERO,tax=BigDecimal.ZERO;
        for(Transaction t:rows) switch(t.type) {
            case "expense" -> { expense=expense.add(t.amount);tax=tax.add(t.taxAmount);categories.merge(t.category,t.amount,BigDecimal::add); }
            case "income" -> income=income.add(t.amount);
            case "refund" -> refund=refund.add(t.amount);
            case "transfer" -> transfer=transfer.add(t.amount);
            default -> throw new IllegalStateException("Unknown transaction type.");
        }
        return new Monthly(user.name,month,rows,expense,income,refund,transfer,tax,categories);
    }
    byte[] excel(Monthly report) throws IOException {
        try(XSSFWorkbook workbook=new XSSFWorkbook();ByteArrayOutputStream output=new ByteArrayOutputStream()) {
            CellStyle header=workbook.createCellStyle();header.setFillForegroundColor(IndexedColors.DARK_GREEN.getIndex());
            header.setFillPattern(FillPatternType.SOLID_FOREGROUND);
            org.apache.poi.ss.usermodel.Font bold=workbook.createFont();bold.setBold(true);bold.setColor(IndexedColors.WHITE.getIndex());header.setFont(bold);
            CellStyle currency=workbook.createCellStyle();currency.setDataFormat(workbook.createDataFormat().getFormat("\"INR \"#,##0.00"));
            Sheet summary=workbook.createSheet("Monthly summary");
            row(summary,0,header,"Monthly expense and recorded tax summary",report.month.toString());
            row(summary,1,null,"Account",report.name);row(summary,2,null,"Currency","INR");
            row(summary,3,null,"Generated (UTC)",Instant.now().toString());
            String[] names={"Expenses","Income","Refunds","Transfers (excluded from net)","Recorded net","Included tax recorded","Number of transactions"};
            BigDecimal[] amounts={report.expenses,report.income,report.refunds,report.transfers,report.net(),report.tax};
            for(int i=0;i<amounts.length;i++) { Row r=row(summary,5+i,null,names[i]);numeric(r,1,amounts[i],currency); }
            row(summary,11,null,names[6],Integer.toString(report.rows.size()));
            row(summary,13,null,"Tax definition","Included tax amounts explicitly entered on expense transactions.");
            row(summary,14,null,"Interpretation","These amounts do not determine tax liability or deductibility.");
            summary.setColumnWidth(0,40*256);summary.setColumnWidth(1,84*256);
            Sheet categories=workbook.createSheet("Expense categories");row(categories,0,header,"Category","Expenses (INR)");
            int n=1;
            for(var entry:report.categories.entrySet()) { Row r=row(categories,n++,null,entry.getKey());numeric(r,1,entry.getValue(),currency); }
            categories.createFreezePane(0,1);categories.setColumnWidth(0,24*256);categories.setColumnWidth(1,25*256);
            Sheet ledger=workbook.createSheet("Transactions");
            String[] columns={"Date","Description","Type","Category","Amount (INR)","Included tax (INR)","Method","Notes","Source"};
            row(ledger,0,header,columns);n=1;
            for(Transaction t:report.rows) {
                Row r=row(ledger,n++,null,t.date.toString(),t.description,t.type,t.category,"","",t.method,t.notes,t.source);
                numeric(r,4,t.amount,currency);numeric(r,5,t.taxAmount,currency);
            }
            ledger.createFreezePane(0,1);ledger.setAutoFilter(new CellRangeAddress(0,Math.max(0,n-1),0,columns.length-1));
            int[] widths={13,42,13,19,24,24,14,60,20};
            for(int i=0;i<widths.length;i++) ledger.setColumnWidth(i,widths[i]*256);
            // All user-provided values are STRING cells; none are evaluated as formulas.
            workbook.write(output);return output.toByteArray();
        }
    }
    static Row row(Sheet sheet,int number,CellStyle style,String... values) {
        Row row=sheet.createRow(number);
        for(int i=0;i<values.length;i++) { Cell c=row.createCell(i,CellType.STRING);c.setCellValue(values[i]);if(style!=null)c.setCellStyle(style); }
        return row;
    }
    static void numeric(Row row,int column,BigDecimal amount,CellStyle style) {
        Cell c=row.createCell(column,CellType.NUMERIC);c.setCellValue(amount.doubleValue());c.setCellStyle(style);
    }
    byte[] pdf(Monthly report) throws IOException {
        ByteArrayOutputStream output=new ByteArrayOutputStream();
        Document document=new Document(PageSize.A4,36,36,42,42);
        try {
            PdfWriter writer=PdfWriter.getInstance(document,output);
            byte[] fontBytes=new ClassPathResource("fonts/DejaVuSans.ttf").getContentAsByteArray();
            BaseFont face=BaseFont.createFont("DejaVuSans.ttf",BaseFont.IDENTITY_H,BaseFont.EMBEDDED,true,fontBytes,null);
            com.lowagie.text.Font normal=new com.lowagie.text.Font(face,9);
            com.lowagie.text.Font title=new com.lowagie.text.Font(face,18,com.lowagie.text.Font.BOLD);
            com.lowagie.text.Font heading=new com.lowagie.text.Font(face,11,com.lowagie.text.Font.BOLD);
            writer.setPageEvent(new PdfPageEventHelper() {
                @Override public void onEndPage(PdfWriter w,Document d) {
                    ColumnText.showTextAligned(w.getDirectContent(),Element.ALIGN_RIGHT,
                        new Phrase("PocketSync  |  Page "+w.getPageNumber(),normal),d.right(),23,0);
                }
            });
            document.addTitle("Monthly expense and recorded tax summary - "+report.month);
            document.addAuthor("PocketSync");document.open();
            document.add(new Paragraph("Monthly expense summary",title));
            document.add(new Paragraph(report.name+"  |  "+report.month+"  |  Currency: INR",normal));
            document.add(new Paragraph("Generated: "+java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm 'UTC'")
                .withZone(ZoneOffset.UTC).format(Instant.now()),normal));
            PdfPTable totals=new PdfPTable(new float[]{2,1});totals.setWidthPercentage(100);totals.setSpacingBefore(16);totals.setSpacingAfter(16);
            pdfRow(totals,heading,true,"Metric","Amount (INR)");
            pdfRow(totals,normal,false,"Expenses",money(report.expenses));pdfRow(totals,normal,false,"Income",money(report.income));
            pdfRow(totals,normal,false,"Refunds",money(report.refunds));pdfRow(totals,normal,false,"Transfers (excluded from net)",money(report.transfers));
            pdfRow(totals,normal,false,"Recorded net: income + refunds - expenses",money(report.net()));
            pdfRow(totals,normal,false,"Included tax explicitly recorded",money(report.tax));document.add(totals);
            document.add(new Paragraph("Recorded tax amounts are included components of expenses supplied by the user or CSV. They do not determine tax liability or deductibility.",normal));
            document.add(new Paragraph("Expenses by category",heading));
            PdfPTable categories=new PdfPTable(new float[]{2,1});categories.setWidthPercentage(100);categories.setSpacingBefore(8);
            pdfRow(categories,heading,true,"Category","INR");categories.setHeaderRows(1);
            for(var entry:report.categories.entrySet()) pdfRow(categories,normal,false,entry.getKey(),money(entry.getValue()));
            if(report.categories.isEmpty()) pdfRow(categories,normal,false,"No expenses","0.00");
            document.add(categories);
            Paragraph detail=new Paragraph("Transaction ledger ("+report.rows.size()+" records)",heading);detail.setSpacingBefore(18);document.add(detail);
            PdfPTable ledger=new PdfPTable(new float[]{1.2f,2.4f,.95f,1.2f,1.8f,1.8f});
            ledger.setWidthPercentage(100);ledger.setSpacingBefore(8);
            pdfRow(ledger,normal,true,"Date","Description / method","Type","Category","Amount INR","Tax INR");ledger.setHeaderRows(1);
            for(Transaction t:report.rows) pdfRow(ledger,normal,false,t.date.toString(),t.description+"\n"+t.method,t.type,t.category,money(t.amount),money(t.taxAmount));
            if(report.rows.isEmpty()) pdfRow(ledger,normal,false,"-","No transactions","-","-","0.00","0.00");
            document.add(ledger);document.close();return output.toByteArray();
        } catch(DocumentException e) { throw new IOException("Could not generate the PDF report.",e); }
        finally { if(document.isOpen()) document.close(); }
    }
    static String money(BigDecimal value) { return String.format(Locale.US,"%,.2f",value); }
    static void pdfRow(PdfPTable table,com.lowagie.text.Font font,boolean header,String... cells) {
        for(String text:cells) {
            PdfPCell cell=new PdfPCell(new Phrase(text,font));cell.setPadding(7);cell.setBorderColor(new Color(216,223,219));
            if(!header&&text.matches("-?\\d[\\d,.]*")) cell.setHorizontalAlignment(Element.ALIGN_RIGHT);
            if(header) cell.setBackgroundColor(new Color(219,237,224));table.addCell(cell);
        }
    }
}
