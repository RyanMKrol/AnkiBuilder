import { speechText } from "./index.js";
import { normalizeTtsText } from "./ttsText.js";

// Computes the set of audio "takes" we normally offer for a card — the Cartesian product of the
// applicable with/without axes, matching what the build-anki-deck skill describes and what the
// dashboard's Generate button synthesizes via ElevenLabs. The axes, applied to the card's spoken
// text (`speechText` = reading||target, run through `normalizeTtsText`):
//   - brackets: full (keep the bracketed content) vs short (drop it)   — only if the text has （…）/(...)
//   - comma:    with 、 vs without                                       — only if the text has 、
// Result: min 1 (a card with neither brackets nor commas) up to 4 (comma × brackets), each
// `{ label, ttsText }`. `ttsText` is the spoken text BEFORE the Japanese end marker is appended — the
// caller adds that, so a variant and the audio stage's own clip hash the same way.
//
// There used to be a third axis offering the text with and without a trailing 。. That existed to work
// around ElevenLabs clipping and mis-rendering short clips; the end marker (./ttsMarker.js) handles
// both, and the 。 is now part of the marker rather than a choice about the card's text — so there is
// no longer a meaningful "with dot / without dot" take to pick between.

const BRACKET_RE = /[（(]([^)）]*)[)）]/;

export function cardAudioVariants(card, languageCode) {
  const base = normalizeTtsText(speechText(card) || "", languageCode);
  if (!base) return [];

  const bracketMatch = base.match(BRACKET_RE);
  const bracketForms = bracketMatch
    ? [
        { label: `with ${bracketMatch[1]}`, text: base.replace(/[（）()]/g, "") },
        { label: `no ${bracketMatch[1]}`, text: base.replace(/[（(][^)）]*[)）]/g, "") },
      ]
    : [{ label: null, text: base }];

  const out = [];
  const seen = new Set();
  for (const bracket of bracketForms) {
    const commaForms = /、/.test(bracket.text)
      ? [
          { label: "with 、", text: bracket.text },
          { label: "no 、", text: bracket.text.replace(/、/g, "") },
        ]
      : [{ label: null, text: bracket.text }];
    for (const comma of commaForms) {
      if (seen.has(comma.text)) continue;
      seen.add(comma.text);
      const label = [bracket.label, comma.label].filter(Boolean).join(" · ") || "default";
      out.push({ label, ttsText: comma.text });
    }
  }
  return out;
}
