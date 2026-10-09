package tracker;

import static tracker.HttpSupport.*;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.awt.Desktop;
import java.io.IOException;
import java.net.Inet4Address;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.net.URI;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executors;

/** Starts the local server, wires services together and enforces request boundaries. */
public final class ExpenseApplication {

    private final Path web;
    private final Set<String> hosts = new HashSet<>();
    private final Object stateLock = new Object();
    private final AccountRepository repository;
    private final ApiController api;
    private final AdapterController adapter;
    private final String setupKey = PasswordService.token();

    private ExpenseApplication(Path web, Path data, boolean seed) throws Exception {
        this.web = web.toAbsolutePath();
        if (!Files.isRegularFile(this.web.resolve("bundle.js"))) {
            throw new IOException("The dist folder is missing. Extract the complete ZIP first.");
        }
        String secret = System.getenv("EXPENSE_ADAPTER_SECRET");
        if (secret != null && secret.length() < 32) {
            throw new IOException(
                "EXPENSE_ADAPTER_SECRET needs at least 32 characters, or must be unset."
            );
        }
        repository = new AccountRepository(data);
        SessionService sessions = new SessionService();
        TransactionService transactions = new TransactionService();
        StatementImportService imports = new StatementImportService(transactions);
        WorkspaceResponse response = new WorkspaceResponse(repository, secret != null);
        if (seed) new SeedDataService(repository, transactions).initialize();
        AuthenticationService authentication = new AuthenticationService(
            repository,
            sessions,
            response,
            setupKey
        );
        AdminController admin = new AdminController(repository, response);
        api = new ApiController(
            repository,
            sessions,
            authentication,
            admin,
            transactions,
            imports,
            response
        );
        adapter = new AdapterController(repository, transactions, secret);
    }

    private void handle(HttpExchange exchange) throws IOException {
        try {
            String host = exchange.getRequestHeaders().getFirst("Host");
            if (host == null || !hosts.contains(host.toLowerCase(Locale.ROOT))) {
                error(exchange, 403, "Unrecognised host.");
                return;
            }
            String path = exchange.getRequestURI().getPath();
            String method = exchange.getRequestMethod();
            // A link from the standalone HTML may open the public app shell.
            // API/data routes still require the existing same-origin boundaries.
            boolean entryNavigation =
                method.equals("GET") &&
                (path.equals("/") || path.equals("/index.html")) &&
                "navigate".equals(exchange.getRequestHeaders().getFirst("Sec-Fetch-Mode")) &&
                "document".equals(exchange.getRequestHeaders().getFirst("Sec-Fetch-Dest"));
            String origin = exchange.getRequestHeaders().getFirst("Origin");
            if (
                !entryNavigation &&
                ((origin != null && !origin.equalsIgnoreCase("http://" + host)) ||
                    "cross-site".equals(exchange.getRequestHeaders().getFirst("Sec-Fetch-Site")))
            ) {
                error(exchange, 403, "Cross-site request rejected.");
                return;
            }
            if (path.equals("/api/integrations/transactions")) {
                synchronized (stateLock) {
                    adapter.handle(exchange);
                }
                return;
            }
            if (path.startsWith("/api/")) {
                if (
                    !method.equals("GET") &&
                    !"ExpenseTracker".equals(
                        exchange.getRequestHeaders().getFirst("X-Requested-With")
                    )
                ) {
                    error(exchange, 403, "Open the app to make changes.");
                    return;
                }
                synchronized (stateLock) {
                    api.handle(exchange, path, method);
                }
                return;
            }
            if (!method.equals("GET") && !method.equals("HEAD")) {
                error(exchange, 405, "Method not allowed.");
                return;
            }
            String asset = switch (path) {
                case "/", "/index.html" -> "index.html";
                case "/bundle.js" -> "bundle.js";
                case "/app.js" -> "app.js";
                case "/logic.js" -> "logic.js";
                case "/styles.css" -> "styles.css";
                default -> null;
            };
            if (asset == null) {
                error(exchange, 404, "Not found.");
                return;
            }
            String contentType = asset.endsWith(".js")
                ? "text/javascript"
                : asset.endsWith(".css")
                  ? "text/css"
                  : "text/html";
            send(
                exchange,
                200,
                contentType + "; charset=utf-8",
                Files.readAllBytes(web.resolve(asset))
            );
        } catch (IllegalArgumentException e) {
            error(exchange, 400, e.getMessage());
        } catch (Exception e) {
            System.err.println("Request failed: " + e.getClass().getSimpleName());
            error(
                exchange,
                500,
                "Could not save this request. Check the Java window and folder permissions."
            );
        } finally {
            exchange.close();
        }
    }

    public static void main(String[] args) throws Exception {
        int port = 8080;
        boolean lan = false;
        boolean open = false;
        boolean seed = true;
        boolean initializeOnly = false;
        Path data = Path.of("data");
        for (String arg : args) {
            if (arg.equals("--lan")) lan = true;
            else if (arg.equals("--open")) open = true;
            else if (arg.equals("--no-seed")) seed = false;
            else if (arg.equals("--initialize-only")) initializeOnly = true;
            else if (arg.startsWith("--port=")) port = Integer.parseInt(arg.substring(7));
            else if (arg.startsWith("--data-dir=")) data = Path.of(arg.substring(11));
            else throw new IllegalArgumentException("Unknown option: " + arg);
        }
        if (port < 1024 || port > 65535) throw new IllegalArgumentException(
            "Choose a port from 1024 to 65535."
        );
        ExpenseApplication app = new ExpenseApplication(Path.of("dist"), data, seed);
        if (initializeOnly) {
            System.out.println(
                "Database ready: " + data.toAbsolutePath().resolve("expense-tracker.mv.db")
            );
            app.repository.close();
            return;
        }
        HttpServer server;
        try {
            server = HttpServer.create(
                new InetSocketAddress(lan ? "0.0.0.0" : "127.0.0.1", port),
                0
            );
        } catch (IOException e) {
            app.repository.close();
            throw e;
        }
        app.hosts.add("127.0.0.1:" + port);
        app.hosts.add("localhost:" + port);
        List<String> phones = new ArrayList<>();
        if (lan) {
            for (var network : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!network.isUp() || network.isLoopback()) continue;
                for (var address : Collections.list(network.getInetAddresses())) {
                    if (address instanceof Inet4Address && address.isSiteLocalAddress()) {
                        app.hosts.add(address.getHostAddress() + ":" + port);
                        phones.add("http://" + address.getHostAddress() + ":" + port);
                    }
                }
            }
        }
        var pool = Executors.newFixedThreadPool(6);
        server.setExecutor(pool);
        server.createContext("/", app::handle);
        server.start();
        Runtime.getRuntime().addShutdownHook(
            new Thread(() -> {
                server.stop(0);
                pool.shutdownNow();
                try {
                    app.repository.close();
                } catch (IOException ignored) {
                    /* The OS also releases the lock at process exit. */
                }
            })
        );
        String url = "http://127.0.0.1:" + port;
        if (app.repository.owner() == null) url += "/#setup=" + app.setupKey;
        System.out.println("Smart Expense Tracker v4 - Website and SQL database are running.");
        System.out.println(
            (app.repository.owner() == null
                ? "Create your owner account on THIS computer: "
                : "Open on this computer: ") + url
        );
        System.out.println("Keep this window open. Press Ctrl+C to stop.");
        if (lan) {
            System.out.println("Phone links on the same private Wi-Fi:");
            phones.forEach(System.out::println);
        }
        if (open) {
            try {
                if (Desktop.isDesktopSupported()) Desktop.getDesktop().browse(URI.create(url));
            } catch (Exception ignored) {
                System.out.println("Copy the link above if no browser opens.");
            }
        }
    }
}
