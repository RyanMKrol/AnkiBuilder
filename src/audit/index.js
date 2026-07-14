// Estimate display width accounting for wide characters (CJK, emoji, etc.)
export function displayWidth(str) {
  let width = 0;
  for (const char of str) {
    const code = char.charCodeAt(0);
    // CJK Unified Ideographs and related blocks
    if (
      (code >= 0x4e00 && code <= 0x9fff) || // CJK Unified Ideographs
      (code >= 0x3040 && code <= 0x309f) || // Hiragana
      (code >= 0x30a0 && code <= 0x30ff) || // Katakana
      (code >= 0xac00 && code <= 0xd7af) || // Hangul Syllables
      (code >= 0x3400 && code <= 0x4dbf) // CJK Extension A
    ) {
      width += 2;
    } else {
      width += 1;
    }
  }
  return width;
}

export function padRight(str, width) {
  const len = displayWidth(str);
  const padding = Math.max(0, width - len);
  return str + " ".repeat(padding);
}

export function padCenter(str, width) {
  const len = displayWidth(str);
  const totalPad = Math.max(0, width - len);
  const leftPad = Math.floor(totalPad / 2);
  const rightPad = totalPad - leftPad;
  return " ".repeat(leftPad) + str + " ".repeat(rightPad);
}

export function renderAuditTable(cards) {
  if (!cards || typeof cards !== "object") {
    return "No cards to audit.\n";
  }

  const items = cards.items || [];
  if (!Array.isArray(items) || items.length === 0) {
    return "No cards to audit.\n";
  }

  // Sort by category then by english text for consistent ordering
  const sorted = [...items].sort((a, b) => {
    const catCmp = (a.category || "").localeCompare(b.category || "");
    if (catCmp !== 0) return catCmp;
    return (a.english || "").localeCompare(b.english || "");
  });

  // Calculate totals
  const totalCards = sorted.length;
  const totalWithImage = sorted.filter((c) => c.image).length;
  const totalWithAudio = sorted.filter((c) => c.audio).length;

  // Column width calculation: use fixed widths with adequate space for wide characters
  // For wide scripts (CJK, etc), each character may display as 2 cols, so we allocate generously
  const columnWidths = {
    english: Math.max(10, Math.min(20, Math.max(...sorted.map((c) => (c.english || "").length)))),
    target: Math.max(
      12,
      Math.min(20, Math.max(...sorted.map((c) => (c.target || "").length)) * 1.2),
    ),
    pronunciation: Math.max(
      14,
      Math.min(20, Math.max(...sorted.map((c) => (c.pronunciation || "").length))),
    ),
    category: Math.max(12, Math.min(18, Math.max(...sorted.map((c) => (c.category || "").length)))),
  };

  const lines = [];

  // Header row
  const header = [
    padRight("English", columnWidths.english),
    padRight("Target", columnWidths.target),
    padRight("Pronunciation", columnWidths.pronunciation),
    padRight("Category", columnWidths.category),
    "Image?",
    "Audio?",
  ].join(" | ");

  lines.push(header);

  // Separator row
  const separator = [
    "-".repeat(columnWidths.english),
    "-".repeat(columnWidths.target),
    "-".repeat(columnWidths.pronunciation),
    "-".repeat(columnWidths.category),
    "-------",
    "-------",
  ].join("-+-");

  lines.push(separator);

  // Data rows
  for (const card of sorted) {
    const imageFlag = card.image ? "✓" : "·";
    const audioFlag = card.audio ? "✓" : "·";

    const row = [
      padRight(card.english || "", columnWidths.english),
      padRight(card.target || "", columnWidths.target),
      padRight(card.pronunciation || "", columnWidths.pronunciation),
      padRight(card.category || "", columnWidths.category),
      padCenter(imageFlag, 7),
      padCenter(audioFlag, 7),
    ].join(" | ");

    lines.push(row);
  }

  // Totals separator
  lines.push(separator);

  // Totals row
  const totalsRow = [
    padRight(`${totalCards} total`, columnWidths.english),
    padRight("", columnWidths.target),
    padRight("", columnWidths.pronunciation),
    padRight("", columnWidths.category),
    padCenter(`${totalWithImage}`, 7),
    padCenter(`${totalWithAudio}`, 7),
  ].join(" | ");

  lines.push(totalsRow);

  return lines.join("\n") + "\n";
}

/**
 * Renders a numbered review table for corpus.json items (pre-translate stage).
 * Unlike renderAuditTable, this NEVER reorders items — the displayed number
 * (1-based) must match each item's position in the given array, since the
 * review CLI command lets the user reference items by that number.
 */
export function renderReviewTable(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return "No items to review.\n";
  }

  const numWidth = Math.max(2, String(items.length).length);
  const columnWidths = {
    english: Math.max(10, Math.min(30, Math.max(...items.map((i) => (i.english || "").length)))),
    category: Math.max(12, Math.min(24, Math.max(...items.map((i) => (i.category || "").length)))),
    target: Math.max(
      12,
      Math.min(20, Math.max(...items.map((i) => (i.target || "").length)) * 1.2),
    ),
    notes: Math.max(10, Math.min(30, Math.max(...items.map((i) => (i.notes || "").length)))),
  };

  const lines = [];

  const header = [
    padRight("#", numWidth),
    padRight("English", columnWidths.english),
    padRight("Category", columnWidths.category),
    padRight("Target", columnWidths.target),
    padRight("Notes", columnWidths.notes),
  ].join(" | ");
  lines.push(header);

  const separator = [
    "-".repeat(numWidth),
    "-".repeat(columnWidths.english),
    "-".repeat(columnWidths.category),
    "-".repeat(columnWidths.target),
    "-".repeat(columnWidths.notes),
  ].join("-+-");
  lines.push(separator);

  items.forEach((item, index) => {
    const row = [
      padRight(String(index + 1), numWidth),
      padRight(item.english || "", columnWidths.english),
      padRight(item.category || "", columnWidths.category),
      padRight(item.target || "", columnWidths.target),
      padRight(item.notes || "", columnWidths.notes),
    ].join(" | ");
    lines.push(row);
  });

  lines.push(separator);
  lines.push(`${items.length} item(s)`);

  return lines.join("\n") + "\n";
}
