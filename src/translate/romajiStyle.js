// ONE pinned romanization spec per language: the prose the prompts are taught, and the detector the
// preflight lint runs, held in the SAME object so they cannot drift apart.
//
// Why this file exists. `pronunciation` renders on the back of BOTH directions of every card, and it
// drifted per batch because four prompts each described the style in their own words and nothing
// checked the result. The measurable damage, on the live decks, before this landed:
//
//   - a trailing ASCII period on 253 cards — 100% of chapter-2/3/4-extras, 0% of chapters 6-13
//   - `-san` hyphenated 32/32 in chapter-7-extras and spaced 40/40 in chapter-8-extras
//   - `kombini` / `konbini`, `ginkou` / `ginkō`, `sou desu` / `sō desu`
//
// A rule here is a `{ id, rule, detect }` triple:
//
//   `rule`    the prose injected into every prompt that romanizes, verbatim. It is also asserted
//             verbatim into the hand-authoring reference (see test/docs/romajiStyle.test.js), so a
//             human authoring an extras card by hand is held to the same spec as the model.
//   `detect`  a function returning the offending substring, or `null` for a rule that is TAUGHT but
//             cannot be mechanically checked. `null` is a first-class answer here: a check that
//             guesses at proper-noun casing would report noise forever, and the honest report is
//             "this rule is taught, not linted" rather than a silent pass.
//
// Adding a rule means adding it in one place, and both the prompts and the lint pick it up.

/** Where a lint hit is reported from, and what the report says the operator should do about it. */
export const ROMAJI_LINT_TIER_NOTE =
  "reported, never auto-fixed: the correction is a paid pass over the card, not a regex";

// One counter-hyphenation convention, shared verbatim by every romanizing prompt so the passes
// cannot drift apart again (they once disagreed on whether jūninichi was correct or forbidden).
export const JA_COUNTER_HYPHEN_RULE =
  "A number and its counter are joined by a HYPHEN: `jūni-nichi`, `shi-gatsu`, `go-ji`, " +
  "`nijūgo-nen`, `ip-pon`, `san-gai`. Never fuse them into one token — `jūninichi` reads as if " +
  'it contains an "ichi" that is not there. An ordinary word that merely looks like a counter ' +
  'keeps its spelling: にほん "Japan" is `nihon`, not `ni-hon`. The NATIVE ひとつ series is one ' +
  "word and never hyphenates: `hitotsu`, `futatsu`, `mittsu`, `yottsu`, `muttsu` — not `mit-tsu`.";

// Spelled-out numbers, and the counters that follow them. Deliberately NOT the full counter
// inventory: every entry here has to be a string that cannot begin an ordinary word in this deck's
// vocabulary, because a fused-counter detector that fires on `nihon` would be teaching the opposite
// of the rule it enforces. `hon`, `kai` and `ji` are left out for exactly that reason.
const JA_NUMBER = "(?:ichi|ni|san|yon|shi|go|roku|nana|shichi|hachi|kyū|ku|jū|hyaku|sen|man)";
const JA_SAFE_COUNTER = "(?:gatsu|nichi|nen|mai|satsu|sai|banme|jikan)";
// The native ひとつ series, which is one word and must NOT be hyphenated. The live deck writes
// `mit-tsu` beside `futatsu`/`yottsu`/`muttsu`, which is the same rule guessed both ways.
const HYPHENATED_NATIVE_NUMERAL = /\b(?:hito|futa|mit|yot|itsu|mut|nana|yat|kokono|tō)-tsu\b/i;
const FUSED_COUNTER = new RegExp(`\\b${JA_NUMBER}${JA_SAFE_COUNTER}\\b`, "i");

// An honorific written as a bare word after a name. The lookbehind is load-bearing: `san` on its own
// is the number three, and this deck ships a card whose whole pronunciation is `san`.
const SPACED_HONORIFIC = /(?<=\S\s)(san|sama|kun|chan|sensei)\b/;

const first = (text, pattern) => {
  const match = text.match(pattern);
  return match ? match[0] : null;
};

/**
 * The pinned Japanese romanization spec: modified Hepburn, with the choices this deck makes where
 * Hepburn leaves room. Order is the order the prompts see.
 */
export const JA_ROMAJI_STYLE = [
  {
    id: "long-vowel-macron",
    rule:
      "Long vowels take a MACRON, never a doubled vowel and never a trailing `u`: `tōkyō`, " +
      "`ginkō`, `yūmei`, `tanjōbi`, `dō`, `rāmen`, `ōsutoraria`. Never `ginkou`, `yuumei`, `dou`, " +
      "`raamen`.",
    // `ou`/`oo` are the unambiguous half. A doubled `uu`/`ee` can be genuine across a morpheme
    // boundary (みずうみ is `mizuumi`, two words), which a regex cannot see, so they are taught here
    // and left to the reviewer rather than reported as errors forever.
    detect: (text) => first(text, /o[ou]/i),
  },
  {
    id: "long-vowel-exceptions",
    rule:
      "Two long vowels keep their doubled spelling: えい stays `ei` (`sensei`, `kirei`, `eiga`) " +
      "and いい stays `ii` (`ōkii`, `oishii`, `atarashii`). A vowel that begins a new morpheme is " +
      "not a long vowel either: みずうみ is `mizuumi`, not `mizūmi`.",
    detect: null,
  },
  {
    id: "n-before-labial",
    rule:
      "ん is always `n`, never `m`, including before b/p/m: `konbini`, `konbanwa`, `sanpo`, " +
      "`tenpura`, `shinbun`. (Traditional Hepburn writes `m` there; this deck does not.)",
    detect: (text) => first(text, /m[bp]/i),
  },
  {
    id: "n-apostrophe",
    rule:
      "ん before a vowel or `y` takes an apostrophe, so the syllable break is unambiguous: " +
      "`sen'en`, `kin'yōbi`, `pan'ya`, `tan'i`. Without it `kinyōbi` reads as きにょうび.",
    // A MISSING apostrophe is undecidable from the romanization alone: `kinyoubi` and `kinyobi` are
    // the same letters whether the kana was ん+や or に+ょ. Taught, not linted.
    detect: null,
  },
  {
    id: "particles",
    rule:
      "Particles are written as they are SPOKEN: を is `o`, topic は is `wa`, direction へ is `e`. " +
      "`hon o yomimasu`, `watashi wa`, `gakkō e ikimasu` — never `wo`, `ha` or `he`.",
    detect: (text) => first(text, /(?:^|\s)wo(?=\s|$)/i),
  },
  {
    id: "sokuon",
    rule:
      "The small っ doubles the following consonant (`kitte`, `gakkō`, `zasshi`), and becomes " +
      "`tch` before ち (`matcha`). Never spell it as a literal `tsu`. The doubling survives the " +
      "counter hyphen below: ろっかい is `rok-kai`.",
    detect: (text) => first(text, /(?:^|\s)tsu(?=\s|$)/i),
  },
  {
    id: "no-terminal-punctuation",
    rule:
      "A romanization NEVER ends in `.`, `!` or `?`. 。／！／？ are marks of the written target, " +
      "not sounds the learner says: `ohayō gozaimasu`, not `ohayō gozaimasu.` A 、 inside the " +
      "sentence stays a comma, and a target running two sentences together separates them with a " +
      "period and a space.",
    detect: (text) => first(text, /[.!?]+\s*$/),
  },
  {
    id: "proper-noun-casing",
    rule:
      "Only proper nouns are capitalised — personal names, place names, company names: " +
      "`Tanaka-san`, `Tōkyō`, `Nihon`, `Nozomi Depāto`. Everything else is lowercase, INCLUDING " +
      "the first word of the romanization, because a romanization is a pronunciation guide and not " +
      "a sentence.",
    // Undecidable without a proper-noun list: `Tanaka-san wa` is right and `Hai, wakarimashita` is
    // wrong, and both are a capital in first position.
    detect: null,
  },
  {
    id: "honorific-hyphen",
    rule:
      "An honorific or title suffix attaches to the name with a HYPHEN, never a space and never " +
      "fused: `Tanaka-san`, `Sumisu-sensei`, `Yamada-sama`, `Kumano-jinja`. `tanaka san` reads as " +
      "two words.",
    detect: (text) => first(text, SPACED_HONORIFIC),
  },
  {
    id: "counter-hyphen",
    rule: JA_COUNTER_HYPHEN_RULE,
    detect: (text) => first(text, FUSED_COUNTER) ?? first(text, HYPHENATED_NATIVE_NUMERAL),
  },
];

/** The pinned styles, keyed by ISO 639-1 code. A language with no entry is not linted. */
export const ROMAJI_STYLES = { ja: JA_ROMAJI_STYLE };

/** The prose rules for a language, in prompt order — `[]` when the language has no pinned style. */
export function romanizationStyleRules(languageCode) {
  return (ROMAJI_STYLES[languageCode] ?? []).map((entry) => entry.rule);
}

/**
 * Every pinned rule `text` breaks, as `[{ id, rule, offender }]`. Empty for a language with no
 * pinned style, and empty for a rule whose `detect` is `null` (taught, not checkable).
 *
 * Report-only by design. Rewriting a romanization correctly is the romanization pass's job, not a
 * regex's: `ginkou` → `ginkō` is safe, `sou` → `sō` is safe, and `dou` → `dō` is safe right up until
 * the word is 同 vs どう and the fix has to know which.
 */
export function lintRomaji(text, languageCode) {
  if (typeof text !== "string" || !text.trim()) return [];
  const style = ROMAJI_STYLES[languageCode];
  if (!style) return [];
  const broken = [];
  for (const entry of style) {
    if (!entry.detect) continue;
    const offender = entry.detect(text);
    if (offender) broken.push({ id: entry.id, rule: entry.rule, offender: offender.trim() });
  }
  return broken;
}

/**
 * The rules as a Markdown bullet list for a `{{ROMANIZATION_STYLE_RULES}}` placeholder. `indent` is
 * whatever the surrounding template line already sits at; the first bullet takes `firstIndent`,
 * because a placeholder is usually already indented by the line it is written on.
 */
export function formatStyleRules(rules, { indent = "", firstIndent = "" } = {}) {
  return rules.map((rule, i) => `${i === 0 ? firstIndent : indent}- ${rule}`).join("\n");
}

/** The rule ids a language teaches but cannot mechanically check — reported, never silently dropped. */
export function unlintedRuleIds(languageCode) {
  return (ROMAJI_STYLES[languageCode] ?? []).filter((e) => !e.detect).map((e) => e.id);
}
