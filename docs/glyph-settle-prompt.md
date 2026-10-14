You are checking how small pictures cut out of a Japanese textbook were read. The book is an
ordinary EPUB, but its publisher printed some words as pictures instead of text: usually a kanji
word with its reading in small kana underneath. Each reading will replace its picture in the book,
and everything later reads that text and never sees the picture. A wrong character is taught to
someone as if the book said it.

Book: {{BOOK_TITLE}}

Every picture below was read three ways, independently: two careful readings by a model (A and B)
and Apple's on-device text recognition (OCR). They did not all agree, or the OCR could not read
the picture. OCR reads small kana as full-size (きよねん for きょねん) and often returns nothing for
a single kanji, so an OCR disagreement on those points alone is not evidence of a mistake.

You are also given where the picture is used: the text before and after it, with `[?]` marking the
picture and `□` marking other pictures nearby. Use the sentence to check that a reading makes sense,
but the picture decides: it is what the book printed.

{{ITEMS}}

## For each picture

Open it with the Read tool and decide what it shows, using the same rules the readers had:

- `"kind": "text"` when it shows writing. `text` is the main line exactly as printed (kanji and
  same-size kana). `reading` is the small kana printed under or over it, one string with no spaces,
  small kana written small; `""` when there is none.
- `"kind": "other"` when it is not writing (a bullet, an icon, a drawing), with `text` and `reading`
  as `""`.

In `note`, say in a few words what decided it (e.g. "A misread 末 as 未", "OCR could not read a
single kanji; A and B agree and match the picture").

## Reply

Every id exactly once, in this form and nothing after it:

<glyphs>
[
  {"id": "g-0001", "kind": "text", "text": "会", "reading": "あ", "note": "OCR silent; A and B agree"}
]
</glyphs>
