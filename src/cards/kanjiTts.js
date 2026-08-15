import { generateCardKanji } from "../audio/kanjiOrthography.js";
import { runKanjiOrthographyClaude as defaultRunClaude } from "../translate/runClaude.js";

/**
 * Fill in every card's `ttsKanji` — its kana text rewritten in natural kanji+kana orthography, as
 * alternate TTS input only.
 *
 * ── Why this is a pass and not a per-card button ─────────────────────────────────────────────────
 *
 * The dashboard has had a per-card **Generate (kanji)** button for a while, and it does the same
 * conversion — but it converts, synthesizes and offers a take in one click, so the orthography only
 * ever exists inside that one interaction. Nothing is stored, nothing can be reviewed in bulk, and a
 * unit that wants kanji TTS throughout means clicking through every card and paying for a take each
 * time.
 *
 * Running the conversion for a whole unit up front separates the two decisions the button fuses:
 * WHAT the voice should read (a text question, cheap, reviewable on screen, and wrong in ways a
 * literate reader can see) from WHETHER this take sounds right (an audio question that costs a
 * credit). The text lands on the cards; the human reads it; only then does `audio` speak it.
 *
 * ── What it does not do ──────────────────────────────────────────────────────────────────────────
 *
 * Storing `ttsKanji` changes nothing about what is spoken. That is gated on the unit's `kanjiTts`
 * flag, set at unit creation, and deliberately separate: kana→kanji is one-to-many, so a conversion
 * introduces a wrong-word channel a learner reading a kana card face cannot detect. The orthography
 * being ON the card is what makes that reviewable at all — before this, the only place a bad
 * conversion could be caught was by ear, after paying for it.
 *
 * Japanese only, and only for cards that have spoken text. Per-card failures are collected rather
 * than thrown: one card the model returns nonsense for must not lose the other forty conversions.
 */
export async function generateUnitKanjiTts(
  cards,
  { runClaude = defaultRunClaude, log = () => {}, force = false } = {},
) {
  if (cards.meta?.targetLanguage && !/^ja/i.test(String(cards.meta.targetLanguage))) {
    throw new Error(
      `kanji orthography is Japanese-only — this unit is ${JSON.stringify(cards.meta.targetLanguage)}`,
    );
  }

  const errors = [];
  let converted = 0;
  let skipped = 0;
  const items = [];

  for (const item of cards.items || []) {
    const spoken = typeof item.ttsText === "string" && item.ttsText ? item.ttsText : item.target;
    // An excluded card ships nothing, and a card with no text has nothing to convert. Neither is
    // worth a model call.
    if (item.excluded || !spoken) {
      items.push(item);
      skipped++;
      continue;
    }
    // Never redo work already reviewed. `--force` is the escape for a conversion that was wrong.
    if (item.ttsKanji && !force) {
      items.push(item);
      skipped++;
      continue;
    }

    try {
      const kanji = await generateCardKanji(item, { runClaude });
      items.push({ ...item, ttsKanji: kanji });
      converted++;
      log(`${item.id}: ${spoken} → ${kanji}`);
    } catch (error) {
      items.push(item);
      errors.push({ id: item.id, message: error.message });
      log(`${item.id}: FAILED — ${error.message}`);
    }
  }

  return { cards: { ...cards, items }, converted, skipped, errors };
}

/**
 * The homophone-bearing class: kana whose kanji is genuinely ambiguous without context.
 *
 * These are the cards a kana→kanji conversion can get WRONG in a way the learner cannot detect,
 * because the card face is kana and only the audio carries the choice. はし is bridge or chopsticks
 * or edge; いま is now or living-room; かみ is paper, hair or god; きます is come, wear or cut. A
 * conversion that picks the wrong one produces a clip that says a different word entirely.
 *
 * Used to weight the A/B sample (scripts/kanji-tts-ab.mjs) toward the cards where the decision is
 * actually load-bearing, rather than measuring forty unambiguous nouns and calling it evidence.
 */
export const HOMOPHONE_KANA = ["はし", "いま", "かみ", "きます", "かえる", "あう", "あける"];

export function bearsHomophone(item) {
  const spoken = typeof item.ttsText === "string" && item.ttsText ? item.ttsText : item.target;
  return typeof spoken === "string" && HOMOPHONE_KANA.some((kana) => spoken.includes(kana));
}
