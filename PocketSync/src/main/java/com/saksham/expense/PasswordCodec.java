package com.saksham.expense;
import java.security.MessageDigest;
import java.util.Base64;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.security.crypto.password.*;
import org.springframework.stereotype.Component;

@Component
class PasswordCodec implements PasswordEncoder {
    private final Pbkdf2PasswordEncoder modern=Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8();
    public String encode(CharSequence password) { return "{pbkdf2}"+modern.encode(password); }
    public boolean matches(CharSequence password,String encoded) {
        if (encoded.startsWith("{pbkdf2}")) return modern.matches(password,encoded.substring(8));
        if (encoded.startsWith("{legacy}")) {
            try {
                String[] parts=encoded.substring(8).split("\\$");
                int iterations=Integer.parseInt(parts[0]);
                if(iterations<100000 || iterations>2000000) return false;
                PBEKeySpec spec=new PBEKeySpec(password.toString().toCharArray(),Base64.getDecoder().decode(parts[1]),iterations,256);
                try {
                    return MessageDigest.isEqual(SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256")
                        .generateSecret(spec).getEncoded(),Base64.getDecoder().decode(parts[2]));
                } finally { spec.clearPassword(); }
            } catch(Exception e) { return false; }
        }
        return false;
    }
    static void validate(String password) {
        if(password==null || password.length()<10 || password.length()>128)
            throw new IllegalArgumentException("Use a password of 10–128 characters.");
    }
}
