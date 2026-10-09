package tracker;

import java.util.Collection;
import java.util.Map;
import java.util.StringJoiner;

/** Encodes the API response types without an external JSON dependency. */
public final class Json {

    private Json() {}

    static String json(Object value) {
        if (value == null) return "null";
        if (value instanceof Boolean || value instanceof Number) return value.toString();
        if (value instanceof Map<?, ?> m) {
            StringJoiner j = new StringJoiner(",", "{", "}");
            for (var e : m.entrySet())
                j.add(json(e.getKey().toString()) + ":" + json(e.getValue()));
            return j.toString();
        }
        if (value instanceof Collection<?> c) {
            StringJoiner j = new StringJoiner(",", "[", "]");
            for (var item : c) j.add(json(item));
            return j.toString();
        }
        StringBuilder out = new StringBuilder("\"");
        for (char c : value.toString().toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\"");
                case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n");
                case '\r' -> out.append("\\r");
                case '\t' -> out.append("\\t");
                default -> {
                    if (c < 32) out.append(String.format("\\u%04x", (int) c));
                    else out.append(c);
                }
            }
        }
        return out.append('"').toString();
    }
}
