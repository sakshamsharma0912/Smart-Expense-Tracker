package tracker;

import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;

/** Request-body parsing, JSON responses and HTTP security headers. */
public final class HttpSupport {

    private HttpSupport() {}

    static byte[] readBody(HttpExchange ex, int limit) throws IOException {
        String type = ex.getRequestHeaders().getFirst("Content-Type");
        if (
            type == null ||
            !type.toLowerCase(Locale.ROOT).startsWith("application/x-www-form-urlencoded")
        ) throw new IllegalArgumentException("Expected URL-encoded form data.");
        byte[] bytes = ex.getRequestBody().readNBytes(limit + 1);
        if (bytes.length > limit) throw new IllegalArgumentException("Request too large.");
        return bytes;
    }

    static Map<String, String> parseForm(byte[] bytes) {
        Map<String, String> f = new HashMap<>();
        for (String part : new String(bytes, StandardCharsets.UTF_8).split("&")) {
            String[] kv = part.split("=", 2);
            String k = URLDecoder.decode(kv[0], StandardCharsets.UTF_8),
                v = kv.length == 2 ? URLDecoder.decode(kv[1], StandardCharsets.UTF_8) : "";
            if (f.put(k, v) != null) throw new IllegalArgumentException("Duplicate form field.");
        }
        return f;
    }

    static Map<String, String> form(HttpExchange ex) throws IOException {
        return parseForm(readBody(ex, 8 * 1024 * 1024));
    }

    static void jsonResponse(HttpExchange ex, int code, Object obj) throws IOException {
        send(
            ex,
            code,
            "application/json; charset=utf-8",
            Json.json(obj).getBytes(StandardCharsets.UTF_8)
        );
    }

    static void error(HttpExchange ex, int code, String message) throws IOException {
        jsonResponse(ex, code, Map.of("error", message == null ? "Request failed." : message));
    }

    static void send(HttpExchange ex, int code, String type, byte[] bytes) throws IOException {
        var h = ex.getResponseHeaders();
        h.set("Content-Type", type);
        h.set("Cache-Control", "no-store");
        h.set("X-Content-Type-Options", "nosniff");
        h.set("X-Frame-Options", "DENY");
        h.set("Referrer-Policy", "no-referrer");
        h.set(
            "Content-Security-Policy",
            "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
        );
        if (ex.getRequestMethod().equals("HEAD")) {
            ex.sendResponseHeaders(code, -1);
            return;
        }
        ex.sendResponseHeaders(code, bytes.length);
        ex.getResponseBody().write(bytes);
    }
}
