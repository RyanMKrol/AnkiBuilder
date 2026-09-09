import test from "node:test";
import assert from "node:assert/strict";
import {
  ROLE_ID,
  renderImageSpecialistPrompt,
  assertImagesAccountedFor,
  judgeImages,
} from "../../src/agents/imageSpecialist.js";
import { VERDICT } from "../../src/agents/imageVerdicts.js";

const IMAGES = [
  { src: "images/p016.jpg", path: "/tmp/x/images/p016.jpg", exists: true, bytes: 4096 },
  { src: "images/p017.jpg", path: "/tmp/x/images/p017.jpg", exists: true, bytes: 2048 },
];
const stub = (payload) => () => JSON.stringify(payload);
const bothJudged = [
  { src: "images/p016.jpg", verdict: VERDICT.REFERENCE_CHART, transcription: "0 ゼロ／れい" },
  { src: "images/p017.jpg", verdict: VERDICT.DECORATIVE, note: "line drawing" },
];

test("the prompt carries every image path and the book's hints", () => {
  const prompt = renderImageSpecialistPrompt({
    images: IMAGES,
    targetLanguage: "ja",
    meta: { hints: { vocabularyTableClass: "voca" } },
  });
  assert.match(prompt, /p016\.jpg/);
  assert.match(prompt, /p017\.jpg/);
  assert.match(prompt, /vocabularyTableClass/);
  assert.doesNotMatch(prompt, /\{\{[A-Z_]+\}\}/);
});

test("items are stamped with the role", () => {
  const { items } = judgeImages({
    images: IMAGES,
    targetLanguage: "ja",
    runClaude: stub({
      items: [{ id: "rei", target: "れい", english: "Zero", category: "Numbers" }],
      verdicts: bothJudged,
    }),
  });
  assert.equal(items[0].producedBy, ROLE_ID);
});

test("skipping an image is rejected, including a decorative one", () => {
  // The dull verdicts are the point: what makes a skipped chart invisible is an image with NO entry.
  assert.throws(
    () =>
      judgeImages({
        images: IMAGES,
        targetLanguage: "ja",
        runClaude: stub({ items: [], verdicts: [bothJudged[0]] }),
      }),
    /did not judge 1 image\(s\): images\/p017\.jpg/,
  );
});

test("an image absent from disk is forced to unreadable, whatever the response claims", () => {
  // A file that does not exist cannot have been opened, so a "decorative" verdict for it is a
  // statement about a picture nobody saw.
  const missing = [{ src: "images/gone.jpg", path: "/tmp/x/gone.jpg", exists: false, bytes: null }];
  const { verdicts } = judgeImages({
    images: missing,
    targetLanguage: "ja",
    runClaude: stub({
      items: [],
      verdicts: [{ src: "images/gone.jpg", verdict: VERDICT.DECORATIVE, note: "just art" }],
    }),
  });
  assert.equal(verdicts[0].verdict, VERDICT.UNREADABLE);
  assert.match(verdicts[0].note, /cannot have been opened/);
});

test("accounting matches on basename, so a full path and a src agree", () => {
  assert.doesNotThrow(() =>
    assertImagesAccountedFor(IMAGES, [
      { src: "p016.jpg", verdict: VERDICT.CONTENT },
      { src: "../images/p017.jpg", verdict: VERDICT.DECORATIVE },
    ]),
  );
});

test("a chapter with no images means no call and no verdicts", () => {
  const never = () => assert.fail("must not spawn a model for a chapter with no images");
  assert.deepEqual(judgeImages({ images: [], targetLanguage: "ja", runClaude: never }), {
    items: [],
    verdicts: [],
  });
});
