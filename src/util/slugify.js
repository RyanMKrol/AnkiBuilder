const COMBINING_MARKS_PATTERN = /[̀-ͯ]/g;

/**
 * A filesystem-safe, lowercase, hyphen-separated slug for `text` — used to derive
 * output folder names from human-facing titles (e.g. an EPUB's `<dc:title>`).
 * Accented characters transliterate to ASCII via NFKD decomposition rather than
 * collapsing to hyphens, apostrophes are deleted outright (not hyphenated), and the
 * result is capped at `maxLength` chars with no dangling separator at either end.
 * Empty or all-punctuation input returns `"untitled"` — never an empty path segment.
 */
export function slugify(text, { maxLength = 60 } = {}) {
  const normalized = (text || "")
    .normalize("NFKD")
    .replace(COMBINING_MARKS_PATTERN, "")
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const truncated = normalized.slice(0, maxLength).replace(/-+$/g, "");
  return truncated || "untitled";
}
