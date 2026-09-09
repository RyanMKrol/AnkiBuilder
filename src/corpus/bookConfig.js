// A book's per-book configuration, split by what code is allowed to do with it.
//
// THE PROBLEM THIS SOLVES. Three modules hardcoded one publisher's markup: the vocabulary-table
// selector `class="voca"`, the `enum-N` / `wnum-N` exercise marker filenames, and English lesson
// label words. Each is a fact about ONE book living in code that runs for every book, and the
// vocabulary one fails silently: on a publisher that marks tables differently the regex matches
// nothing, the check reports zero uncovered headwords, and that is indistinguishable from a
// chapter whose vocabulary is fully carded.
//
// The obvious fix, "move those selectors into per-book config", trades one failure for a subtler
// one. There is no promise an EPUB is internally consistent, so a selector is a good guess and
// never a guarantee. Code that BRANCHES on a guess produces confidently wrong answers; code that
// hands the guess to a model as orientation produces a better-informed judgement. Those are
// different powers and they need different storage, or the first quietly grows out of the second.
//
// So book.json has two sections and they are not interchangeable:
//
//   invariants  facts code may branch on, because they really are stable for this book.
//               `labelDecoding` is the archetype: it is stamped once and frozen forever, because
//               a chapter label flows into a live Anki deck name and a deck rename is not a
//               rename. Reading one of these is a decision the code is entitled to make.
//
//   hints       what onboarding noticed about this publisher. These reach PROMPTS ONLY, as
//               orientation for a model that can disagree with them. A wrong or missing hint
//               costs recall; it can never cost correctness, because nothing branches on it.
//
// HOW THE SEPARATION IS ENFORCED, rather than merely documented: `bookInvariants` returns only
// keys named in INVARIANT_KEYS below. A hint cannot become a code dependency by being read, only
// by being PROMOTED — which means editing this allow-list, which is a reviewed change to code.
// That is the whole mechanism, and it is why the list is a frozen literal and not a schema.

/**
 * The keys code is permitted to branch on. Adding one is the deliberate act of saying "this fact
 * is stable enough for this book that a wrong value is a bug, not a bad guess". Do not add a key
 * here to make a hint convenient to read.
 */
export const INVARIANT_KEYS = Object.freeze(["labelDecoding"]);

/**
 * The invariants for a loaded `book.json`, and nothing else.
 *
 * Reads the legacy flat shape too. Books registered before this split stored `labelDecoding` at the
 * top level, and their file is NOT rewritten: a pinned config that a delivered deck depends on is
 * exactly the kind of thing that should not be migrated as a side effect of a refactor.
 */
export function bookInvariants(meta) {
  if (!meta || typeof meta !== "object") return {};
  const source = meta.invariants && typeof meta.invariants === "object" ? meta.invariants : meta;
  const out = {};
  for (const key of INVARIANT_KEYS) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
}

/**
 * The hints for a loaded `book.json`. Frozen, because the only correct thing to do with these is
 * read them into a prompt.
 */
export function bookHints(meta) {
  const hints = meta?.hints;
  return Object.freeze({ ...(hints && typeof hints === "object" ? hints : {}) });
}

/**
 * The hints as a prompt block, or `null` when the book has none.
 *
 * `null` rather than an empty string on purpose: a caller has to decide what "this book has no
 * hints" reads like in its own prompt, and the honest answer is never a silent empty section.
 */
export function renderBookHints(meta) {
  const hints = bookHints(meta);
  const keys = Object.keys(hints).sort();
  if (!keys.length) return null;
  return keys.map((key) => `- **${key}**: ${hints[key]}`).join("\n");
}

/**
 * Throws when a book.json declares the same key as both an invariant and a hint.
 *
 * That state is not merely untidy, it is ambiguous about the one thing this module exists to keep
 * unambiguous: whether code may act on the value.
 */
export function assertConfigSeparation(meta, { path = "book.json" } = {}) {
  const hintKeys = Object.keys(bookHints(meta));
  const clash = hintKeys.filter((key) => INVARIANT_KEYS.includes(key));
  if (clash.length) {
    throw new Error(
      `${path} declares ${clash.join(", ")} as both an invariant and a hint. ` +
        `A key is one or the other: code may branch on an invariant and may never branch on a hint.`,
    );
  }
  return meta;
}
