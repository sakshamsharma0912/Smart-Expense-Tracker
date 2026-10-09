package tracker;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;

/** Generates secure tokens and salts, hashes passwords and compares secrets. */
public final class PasswordService {

    private static final SecureRandom RANDOM = new SecureRandom();

    private PasswordService() {}

    static String newSalt() {
        byte[] salt = new byte[16];
        RANDOM.nextBytes(salt);
        return Base64.getEncoder().encodeToString(salt);
    }

    static String token() {
        byte[] b = new byte[32];
        RANDOM.nextBytes(b);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(b);
    }

    static String passwordHash(String password, String salt) throws Exception {
        PBEKeySpec spec = new PBEKeySpec(
            password.toCharArray(),
            Base64.getDecoder().decode(salt),
            210000,
            256
        );
        try {
            return Base64.getEncoder().encodeToString(
                SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                    .generateSecret(spec)
                    .getEncoded()
            );
        } finally {
            spec.clearPassword();
        }
    }

    static boolean constant(String a, String b) {
        return (
            a != null &&
            b != null &&
            MessageDigest.isEqual(
                a.getBytes(StandardCharsets.UTF_8),
                b.getBytes(StandardCharsets.UTF_8)
            )
        );
    }

    static String sha(String value) {
        try {
            return HexFormat.of().formatHex(
                MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))
            );
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
