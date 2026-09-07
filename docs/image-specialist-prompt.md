# Task: Judge a Chapter's Images

Open every image listed below and say what it is. Where it carries teaching content, read that
content out.

Publishers put grid-shaped material into pictures constantly, which means the images are where a
chapter's paradigms, kana charts and counter tables tend to live. Text-only passes cannot see any of
it, and an `<img>` tag's `alt` attribute is usually empty even when the picture is the whole lesson.
You are the only pass that looks.

{{CARD_RULES}}

## Open them. Do not judge by filename or position.

Each path below is a real file on disk. Open it with your Read tool, which renders images. A file you
did not open gets `"unreadable"`, not a guess: deciding a picture was decorative without looking is
the exact failure this pass exists to remove, and it is indistinguishable from having looked.

## Output Format

Respond with ONLY a single JSON object, no markdown fences and no prose around it:

```json
{
  "items": [
    {
      "id": "kebab-case-handle",
      "target": "the {{TARGET_LANGUAGE}} text as printed in the image",
      "english": "Its gloss, in sentence case.",
      "category": "one of the categories below",
      "fromImage": "images/p016.jpg",
      "uncertain": true,
      "reviewNote": "optional; why you are unsure"
    }
  ],
  "verdicts": [
    {
      "src": "images/p016.jpg",
      "verdict": "reference-chart",
      "transcription": "0 ゼロ／れい …",
      "note": "the numbers chart"
    },
    { "src": "images/p017.jpg", "verdict": "decorative", "note": "line drawing of a station" }
  ]
}
```

**Every image listed below must appear exactly once in `verdicts`.** That is checked. Recording the
dull ones is the point rather than an oversight: what makes a skipped chart invisible is an image
with NO entry, and that is only detectable when the decorative ones are present too.

### Verdicts

- `content` — the image IS the teaching material: a phrase presented as an illustrated panel with its
  gloss drawn in, an expressions page rendered entirely as pictures.
- `reference-chart` — a kana chart, conjugation table, counter or number chart, drawn rather than
  marked up. Transcribe it.
- `labelled-figure` — a diagram, map or photo whose labels are themselves vocabulary: a floor plan
  with room names, a dish captioned with its name.
- `decorative` — art accompanying a section, carrying no text of its own.
- `unreadable` — you could not open it, or could not make sense of what you saw. A real answer, and
  the one that should send a person to the picture.

## Reading a chart

- **Transcribe what is printed, not what you expect.** A counter series is irregular on purpose and
  the exceptions are the reason the chart exists.
- **A cell can hold two readings.** `0 ゼロ／れい` teaches both, and taking only the first silently
  loses one: in the deck this prompt was written for, `ゼロ` and `よん` are taught while `れい`, `し`,
  `しち` and `く` appear on no card at all.
- **Return entries, not sentences.** A word or fixed expression printed in a picture is a card here;
  a full sentence belongs to a later pass.
- Where the picture gives a word but no English, supply your best gloss, set `"uncertain": true`, and
  say where it came from in `reviewNote`.

## Category

{{CATEGORY_LIST}}

## What a card looks like

{{CARD_FACES}}

## This book's conventions

Orientation, not instructions. Where a hint disagrees with the picture in front of you, the picture
wins, and say so in that image's `note`.

{{BOOK_HINTS}}

## The images

Every image this chapter references, in document order.

```json
{{IMAGES_JSON}}
```
