import { speechText } from "./index.js";
import { normalizeTtsText } from "./ttsText.js";
import { getAltAudioTransform } from "./altAudio.js";

// Computes the set of audio "takes" we normally offer for a card — the Cartesian product of the
// applicable with/without axes, matching what the build-anki-deck skill describes and what the
// dashboard's Generate button synthesizes via ElevenLabs. The axes, applied to the card's spoken
// text (`speechText` = reading||target, run through `normalizeTtsText`):
//   - brackets: full (keep the bracketed content) vs short (drop it)   — only if the text has （…）/(...)
//   - comma:    with 、 vs without                                       — only if the text has 、
//   - dot:      no 。 vs with 。 (the language's alt-audio transform)     — only for languages with one
// Result: min 1 (a plain card in a language with no dot transform) up to 8 (dot × comma × brackets),
// each `{ label, ttsText }`. `ttsText` is the exact string handed to TTS — the dot variants line up
// byte-for-byte with the audio stage's own default/alt clips, so they hit the same on-disk cache.

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

  const altTransform = getAltAudioTransform(languageCode);
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
      const dotForms = altTransform
        ? [
            { label: "no 。", text: comma.text },
            { label: "。", text: altTransform(comma.text) },
          ]
        : [{ label: null, text: comma.text }];
      for (const dot of dotForms) {
        if (seen.has(dot.text)) continue;
        seen.add(dot.text);
        const label =
          [bracket.label, comma.label, dot.label].filter(Boolean).join(" · ") || "default";
        out.push({ label, ttsText: dot.text });
      }
    }
  }
  return out;
}
