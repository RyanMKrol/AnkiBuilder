// The image specialist: what every one of a chapter's images is, and what the useful ones say.
//
// It is the only pass that looks. Publishers put grid-shaped material into pictures constantly, so
// the images are where a chapter's paradigms, kana charts and counter tables live, and an `<img>`
// tag's `alt` is usually empty even when the picture is the whole lesson. Every text pass in this
// pipeline is blind to all of it.
//
// WHY THE DULL VERDICTS ARE KEPT. The failure being closed is not "the model judged an image
// wrongly", it is "nobody looked and the output says nothing about it". A skipped chart and a
// chapter with no chart produce identical results unless the decorative images are recorded too, so
// `assertImagesAccountedFor` rejects a response that omits any image it was given. The storage this
// writes into (src/agents/imageVerdicts.js) exists for the same reason and was built first.
//
// `unreadable` is a verdict rather than an error, and the prompt says a file the role did not open
// must take it. Deciding a picture was decorative without opening it is exactly the failure here,
// and from the outside it is indistinguishable from having looked.

import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";
import { renderPromptTemplate, extractJsonObjectText } from "../util/promptTemplate.js";
import { renderCardFacesBlock } from "../deck/cardFaces.js";
import { CATEGORIES } from "../model/categories.js";
import { renderBookHints } from "../corpus/bookConfig.js";
import { unaccountedImages, VERDICT } from "./imageVerdicts.js";
import { runRole } from "./runRole.js";

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const IMAGE_SPECIALIST_PROMPT_PATH = resolve(
  join(MODULE_DIR, "..", "..", "docs", "image-specialist-prompt.md"),
);

export const ROLE_ID = "imageSpecialist";

const NO_HINTS =
  "(no conventions recorded for this book — open every image and judge what you see)";

/**
 * The prompt for one chapter's images.
 *
 * Each entry carries the resolved path on disk, because the role opens the file itself, plus the
 * `src` it must key its verdict on. Sending both keeps the answer joinable to the markup without
 * making the role reason about relative paths.
 */
export function renderImageSpecialistPrompt({ images, targetLanguage, meta = null }) {
  const payload = images.map((image) => ({
    src: image.src,
    path: image.path,
    exists: image.exists,
    bytes: image.bytes,
  }));
  return renderPromptTemplate(IMAGE_SPECIALIST_PROMPT_PATH, {
    TARGET_LANGUAGE: targetLanguage,
    CATEGORY_LIST: CATEGORIES.map((c) => `- ${c}`).join("\n"),
    CARD_FACES: renderCardFacesBlock(),
    BOOK_HINTS: renderBookHints(meta) ?? NO_HINTS,
    IMAGES_JSON: JSON.stringify(payload, null, 2),
  });
}

/**
 * Rejects a response that did not judge every image it was shown.
 *
 * Reuses `unaccountedImages` so the check and the stored artifact agree on what "accounted for"
 * means, down to the basename matching. Two definitions of that would eventually disagree, and the
 * disagreement would show up as a chapter that looks fully judged and is not.
 */
export function assertImagesAccountedFor(images, verdicts) {
  const missing = unaccountedImages(
    images.map((image) => image.src),
    { entries: verdicts },
  );
  if (missing.length) {
    throw new Error(
      `image specialist did not judge ${missing.length} image(s): ${missing.slice(0, 3).join(", ")}` +
        `${missing.length > 3 ? ", …" : ""}. A skipped chart and a chapter with no chart look the ` +
        `same unless every image carries a verdict, including the decorative ones.`,
    );
  }
  return verdicts;
}

/**
 * Judges one chapter's images. Returns `{ items, verdicts }`.
 *
 * An image the role could not open is forced to `unreadable` rather than trusted as decorative: a
 * file that does not exist on disk cannot have been looked at, whatever the response says.
 */
export function judgeImages({ images, targetLanguage, meta = null, runClaude } = {}) {
  if (!Array.isArray(images) || images.length === 0) {
    return { items: [], verdicts: [] };
  }
  const prompt = renderImageSpecialistPrompt({ images, targetLanguage, meta });
  const raw = runRole(ROLE_ID, prompt, runClaude ? { runClaude } : {});
  const parsed = JSON.parse(extractJsonObjectText(raw));

  const missingOnDisk = new Set(images.filter((i) => !i.exists).map((i) => i.src));
  const verdicts = (Array.isArray(parsed.verdicts) ? parsed.verdicts : []).map((entry) =>
    missingOnDisk.has(entry.src)
      ? {
          ...entry,
          verdict: VERDICT.UNREADABLE,
          note: `${entry.note ? `${entry.note}. ` : ""}File absent from disk, so it cannot have been opened.`,
        }
      : entry,
  );
  assertImagesAccountedFor(images, verdicts);

  const items = (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
    ...item,
    producedBy: ROLE_ID,
  }));
  return { items, verdicts };
}
