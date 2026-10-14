You are reading small pictures cut out of a Japanese textbook. The book is an ordinary EPUB, but
its publisher printed some words as pictures instead of text: usually a kanji word with its reading
in small kana underneath. Each picture sits in the middle of a line of text, and your reading will
replace the picture. Everything later reads your text and never sees the picture. A wrong
character is taught to someone as if the book said it.

Book: {{BOOK_TITLE}}

The pictures (id, then path):

{{GLYPH_LIST}}

Open every one with the Read tool and look at it closely. Do not guess from what a word "should"
be; you are not shown the sentence on purpose. Read what is printed.

## For each picture

Decide its `kind`:

- `"text"`: the picture shows writing. Almost all of them are Japanese: kanji, sometimes with kana
  printed at the same size (食べ), and usually a reading in small kana under or over it.
  Digits or Latin letters count too.
  - `text`: the main line exactly as printed, every character, kanji and same-size kana alike.
  - `reading`: the small kana printed under or over the main line, as ONE string for the whole
    picture with no spaces (六本木 with ろっぽんぎ underneath gives `"ろっぽんぎ"`). Write small kana
    (ゃ ゅ ょ っ ぁ) small when they are printed small: きょねん, not きよねん. Use `""` when there is
    no reading printed.
- `"other"`: not writing at all (a bullet, an icon, an arrow, a drawing). Put a few words saying
  what it is in `note`, and leave `text` and `reading` as `""`.

If a character is genuinely unreadable, give your best reading and say so in `note`. Never leave a
character out.

## Reply

Reply with every id exactly once, in this form and nothing after it:

<glyphs>
[
  {"id": "g-0001", "kind": "text", "text": "食", "reading": "た", "note": ""},
  {"id": "g-0002", "kind": "other", "text": "", "reading": "", "note": "a square bullet"}
]
</glyphs>
