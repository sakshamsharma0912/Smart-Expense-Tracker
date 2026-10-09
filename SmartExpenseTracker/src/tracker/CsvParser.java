package tracker;

import java.util.ArrayList;
import java.util.List;

/** Parses quoted commas, escaped quotes and multiline CSV cells. */
public final class CsvParser {

    private CsvParser() {}

    static List<List<String>> csv(String input) {
        if (input.startsWith("\uFEFF")) input = input.substring(1);
        List<List<String>> rows = new ArrayList<>();
        List<String> row = new ArrayList<>();
        StringBuilder value = new StringBuilder();
        boolean quoted = false,
            closed = false;
        for (int i = 0; i < input.length(); i++) {
            char c = input.charAt(i);
            if (c == '"') {
                if (quoted && i + 1 < input.length() && input.charAt(i + 1) == '"') {
                    value.append('"');
                    i++;
                } else if (quoted) {
                    quoted = false;
                    closed = true;
                } else if (value.length() == 0 && !closed) quoted = true;
                else throw new IllegalArgumentException("Invalid CSV quotation.");
            } else if ((c == ',' || c == '\n' || c == '\r') && !quoted) {
                row.add(value.toString());
                value.setLength(0);
                closed = false;
                if (c != ',') {
                    if (c == '\r' && i + 1 < input.length() && input.charAt(i + 1) == '\n') i++;
                    if (row.stream().anyMatch(v -> !v.isBlank())) rows.add(row);
                    row = new ArrayList<>();
                }
            } else {
                if (closed) throw new IllegalArgumentException(
                    "Unexpected character after a CSV quote."
                );
                value.append(c);
            }
            if (rows.size() > 10001) throw new IllegalArgumentException(
                "Import at most 10000 rows at a time."
            );
        }
        if (quoted) throw new IllegalArgumentException("Unclosed CSV quotation.");
        row.add(value.toString());
        if (row.stream().anyMatch(v -> !v.isBlank())) rows.add(row);
        return rows;
    }

    static String cell(List<String> row, int index) {
        return index < 0 ? "" : index < row.size() ? row.get(index).trim() : "";
    }
}
