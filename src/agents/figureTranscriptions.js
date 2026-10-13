// The base phase's reading of a chapter's pictures, handed on to the phase-2 miners.
//
// THE FAILURE THIS CLOSES. Phase 1's image specialist opens every picture in the chapter and
// transcribes the ones that carry content (`image-verdicts.json` in the base unit, written by
// `writeVerdicts`). Phase 2's miners read the same chapter file, but as markup: a drill whose cues
// are pictures is, to them, an `<img>` tag and nothing else. On Busy People Lesson 23 the
// fill-in-the-blank miner dropped Exercise VI ("the three blanks are cued only by illustrations")
// while the base unit already held "1. Sun (circled) / Sat (crossed out)", "2. スノーボード … /
// スキー …" and "3. のど … / あたま …" for exactly those figures. The answer existed one directory
// over and nothing carried it across.
//
// So the transcriptions travel, keyed by the `src` the chapter's `<img>` tag uses, which is the key
// the verdicts are written under. Only content-bearing verdicts with a transcription are passed:
// a decorative picture has nothing to say, and an `unreadable` one is a question for a human, not a
// cue a miner should build a sentence on.
//
// FAIL OPEN. A base unit built before verdicts were recorded, or one whose file is missing, gives
// `null`, and phase 2 then runs exactly as it did before this existed. The phase says so in its run
// report rather than here, because the report is what an operator reads.

import { existsSync } from "fs";
import { readVerdicts, verdictsPath, contentBearing } from "./imageVerdicts.js";

/**
 * The figure transcriptions a base unit recorded, or null when it recorded none at all.
 *
 * Returns `{ source, figures }`, where `figures` is `[{ src, verdict, transcription }]`. An empty
 * `figures` is a real answer (the chapter's pictures were all decorative); `null` means nobody can
 * say, and the caller must report it as such.
 *
 * The specialist's `note` is deliberately left behind. It is written for the base unit's question
 * ("is this a card?"), and a note saying "nothing to card" beside a figure would read to a miner as
 * an instruction to skip the drill it cues, which is the opposite of why the figure is being sent.
 */
export function readFigureTranscriptions(baseUnitDir) {
  if (!baseUnitDir || !existsSync(verdictsPath(baseUnitDir))) return null;
  let verdicts;
  try {
    verdicts = readVerdicts(baseUnitDir);
  } catch {
    return null;
  }
  const figures = contentBearing(verdicts)
    .filter((entry) => typeof entry.transcription === "string" && entry.transcription.trim())
    .map((entry) => ({
      src: entry.src,
      verdict: entry.verdict,
      transcription: entry.transcription.trim(),
    }));
  return { source: verdictsPath(baseUnitDir), figures };
}

const NO_FIGURES =
  "(no figure transcriptions were available for this chapter. A drill cued only by a picture you " +
  "cannot read is skipped, with that as its reason.)";

/**
 * The `{{FIGURES}}` block for a miner's prompt: the transcriptions as JSON, or a line saying there
 * are none. Never empty, so the prompt never reads as though a section was lost.
 */
export function renderFiguresBlock(figures) {
  if (!Array.isArray(figures) || figures.length === 0) return NO_FIGURES;
  const payload = figures.map(({ src, transcription }) => ({ src, transcription }));
  return ["```json", JSON.stringify(payload, null, 2), "```"].join("\n");
}
