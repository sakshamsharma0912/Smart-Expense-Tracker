import java.lang.reflect.InvocationTargetException;
import java.net.URL;
import java.net.URLClassLoader;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import javax.tools.JavaCompiler;
import javax.tools.ToolProvider;

/** Compiles the separate Java classes and loads the bundled JDBC driver. */
public final class ExpenseServer {

    public static void main(String[] args) throws Exception {
        JavaCompiler compiler = ToolProvider.getSystemJavaCompiler();
        if (compiler == null) {
            throw new IllegalStateException(
                "Install a full JDK 17 or newer, then run the launcher again."
            );
        }
        Path sources = Path.of("src", "tracker");
        if (!Files.isDirectory(sources)) {
            throw new IllegalStateException(
                "Extract the complete ZIP and run from its project folder."
            );
        }
        Path classes = Path.of("build", "classes");
        Files.createDirectories(classes);
        var options = new ArrayList<String>();
        options.addAll(
            java.util.List.of(
                "--release",
                "17",
                "--add-modules",
                "jdk.httpserver",
                "-encoding",
                "UTF-8",
                "-d",
                classes.toString()
            )
        );
        try (var files = Files.walk(sources)) {
            files
                .filter(p -> p.toString().endsWith(".java"))
                .sorted()
                .forEach(p -> options.add(p.toString()));
        }
        if (compiler.run(null, null, null, options.toArray(String[]::new)) != 0) {
            throw new IllegalStateException("Java compilation failed. See the errors above.");
        }
        // Keep this loader alive while HTTP worker threads are running.
        Path driver = Path.of("lib", "h2-2.5.252.jar");
        if (!Files.isRegularFile(driver)) {
            throw new IllegalStateException(
                "The bundled database driver is missing. Extract the complete ZIP."
            );
        }
        URLClassLoader loader = new URLClassLoader(
            new URL[] { classes.toUri().toURL(), driver.toUri().toURL() },
            ClassLoader.getPlatformClassLoader()
        );
        Thread.currentThread().setContextClassLoader(loader);
        try {
            Class.forName("tracker.ExpenseApplication", true, loader)
                .getMethod("main", String[].class)
                .invoke(null, (Object) args);
        } catch (InvocationTargetException e) {
            if (e.getCause() instanceof Exception cause) throw cause;
            throw e;
        }
    }
}
