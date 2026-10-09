package tracker;

import java.util.List;
import java.util.Map;

/** A validated preview; records enter the inbox only after a commit. */
public record ImportResult(List<Map<String, String>> rows, int duplicates) {}
