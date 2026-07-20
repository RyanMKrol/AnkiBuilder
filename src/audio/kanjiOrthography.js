import { runClaude as defaultRunClaude } from "../translate/runClaude.js";

// Generates a natural kanji+kana orthography for a Japanese card, purely as an alternate TEXT to feed
// TTS. ElevenLabs mis-parses all-kana input (it's out-of-distribution vs. natural Japanese writing —
// e.g. スーパーは１０じから６じまでです only voiced correctly once kanji was introduced), so a kanji form
// often reads more naturally. This is audio-only: the learner still sees the kana `target`/`reading`.
// The reading is PINNED — the model must not change how the sentence is pronounced, only the script —
// and the human auditions the result before picking it, so a bad conversion is caught by ear.

function stripFence(text) {
  const m = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n```\s*$/);
  return m ? m[1] : text;
}

export function buildKanjiOrthographyPrompt(item) {
  const input = {
    id: item.id,
    english: item.english,
    reading: item.reading || item.target,
    target: item.target,
  };
  return [
    "# Task: Natural Japanese Orthography for Text-to-Speech",
    "",
    "You convert a beginner-friendly, ALL-KANA Japanese sentence into the natural mixed kanji+kana",
    "orthography a literate Japanese adult would write it in — purely so a text-to-speech engine reads",
    "it more naturally (all-kana input is out-of-distribution and gets mis-parsed).",
    "",
    "## Rules",
    "- Preserve the EXACT reading of the kana. Only add kanji where it does NOT change how the sentence",
    "  is pronounced. When a kanji would be ambiguous (multiple readings), leave that word as kana.",
    "- Keep grammatical/okurigana kana as in normal Japanese writing (は, を, が, です, ます, から, まで …).",
    "- Do NOT translate, rephrase, add, or drop any word. Same sentence, same reading — only the script changes.",
    "- `english` and `target` are context to disambiguate meaning; do not echo them.",
    "",
    "## Input",
    "```json",
    JSON.stringify(input, null, 2),
    "```",
    "",
    "## Output",
    "Respond with ONLY a JSON object — no markdown fences, no prose before or after:",
    '{ "kanji": "<the same sentence in natural kanji+kana orthography>" }',
  ].join("\n");
}

// Runs the conversion for one card and returns the kanji orthography string. Throws on an unusable
// response (the caller surfaces it as a generation error). `runClaude` is injectable for tests.
export function generateCardKanji(item, { runClaude = defaultRunClaude } = {}) {
  const raw = runClaude(buildKanjiOrthographyPrompt(item));
  let parsed;
  try {
    parsed = JSON.parse(stripFence(String(raw).trim()).trim());
  } catch {
    throw new Error("kanji orthography response was not valid JSON");
  }
  const kanji = parsed && typeof parsed.kanji === "string" ? parsed.kanji.trim() : "";
  if (!kanji) throw new Error("kanji orthography response had no `kanji` string");
  return kanji;
}
