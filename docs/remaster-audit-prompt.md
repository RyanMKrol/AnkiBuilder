Two readers disagreed about one page of a textbook, and you are settling that disagreement against
the page itself. One reader wrote the transcript below. The other is OCR: reliable about characters,
poor about layout, and prone to misreading small print, kana crowded by furigana, and letter-spaced
headings.

The page image is at: {{IMAGE_PATH}}

Open it with the Read tool and look at the places listed below. You are NOT re-transcribing the
page: you are checking a short list of specific disagreements, and leaving everything else alone.

Book: {{BOOK_TITLE}}
Page {{PAGE_NUMBER}}.

## What the two readers disagree about

{{DISAGREEMENTS}}

## How to judge each one

- **Characters the OCR saw and the transcript does not have**: look at that part of the page. Either
  the transcript dropped something (a correction) or the OCR misread something that is not there
  (no correction).
- **Characters only the transcript has**: check the page really prints them. Watch for text the OCR
  cannot read well: furigana, small print inside pictures, letter-spaced headings, text repeated
  twice on the page.
- **A line the transcript does not contain**: find that line on the page. If the page prints it and
  the transcript lacks it, that is a correction. OCR gibberish that matches nothing on the page is
  not.
- **A gap in numbered items**: check whether the page really numbers them that way.

## What to return

One JSON object and nothing else:

```json
{
  "verdict": "transcript-correct",
  "reason": "One short line: what you checked and what the page shows.",
  "corrections": []
}
```

- `verdict` is `transcript-correct` (every disagreement is the OCR's mistake, or a difference that
  does not change what the page says), `transcript-wrong` (the page shows something the transcript
  does not), or `unclear` (you cannot tell from the image, e.g. print too small to resolve).
- `corrections` is empty unless the verdict is `transcript-wrong`. Each correction is an exact
  string swap inside the transcript:

```json
{
  "find": "<the exact text in the transcript, long enough to occur once>",
  "replace": "<what the page shows>"
}
```

Rules for a correction, which are checked mechanically and will be rejected otherwise:

- `find` must appear EXACTLY ONCE in the transcript, character for character. Include enough
  surrounding text to make it unique, and keep any markup inside it intact.
- `replace` is the same span as the page prints it, with the same markup style (`<ruby>` for
  furigana, `<em>` for emphasis the book prints).
- Change only what the disagreements above are about. Do not tidy, reorder, translate or improve
  anything else.
- To add something the transcript dropped, make `find` the text on one side of the hole and
  `replace` that same text plus the missing part.

## The transcript

```
{{TRANSCRIPT}}
```
