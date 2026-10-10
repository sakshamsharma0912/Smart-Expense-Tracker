package com.saksham.expense;

import java.io.IOException;
import java.nio.*;
import java.nio.charset.*;
import java.util.*;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

@RestController @RequestMapping("/api")
class StatementController {
    private final AuthService auth;private final StatementService imports;
    StatementController(AuthService auth,StatementService imports) { this.auth=auth;this.imports=imports; }
    @PostMapping(value="/statements/import",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    Map<String,Object> smart(@AuthenticationPrincipal Jwt jwt,@RequestPart("file") MultipartFile file,
        @RequestParam Map<String,String> fields) throws IOException {
        User user=auth.current(jwt);
        String name=Objects.requireNonNullElse(file.getOriginalFilename(),"");
        if(file.isEmpty()||file.getSize()>StatementParser.MAX_BYTES||!name.toLowerCase(Locale.ROOT).endsWith(".csv"))
            throw new IllegalArgumentException("Choose a nonempty .csv file up to 2 MB.");
        String csv;
        try { csv=StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT)
            .onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(file.getBytes())).toString(); }
        catch(CharacterCodingException e) { throw new IllegalArgumentException("Save your CSV as UTF-8 before uploading."); }
        return imports.commit(user,csv,fields,true);
    }
    @PostMapping("/import/preview")
    Map<String,Object> preview(@AuthenticationPrincipal Jwt jwt,@RequestParam Map<String,String> fields) {
        return imports.preview(auth.current(jwt),fields);
    }
    @PostMapping("/import/commit")
    Map<String,Object> commit(@AuthenticationPrincipal Jwt jwt,@RequestParam Map<String,String> fields) {
        return imports.commit(auth.current(jwt),fields.get("csv"),fields,false);
    }
    @PostMapping("/import/legacy")
    Map<String,Object> legacy(@AuthenticationPrincipal Jwt jwt,@RequestParam Map<String,String> fields) {
        return imports.legacy(auth.current(jwt),fields);
    }
}
