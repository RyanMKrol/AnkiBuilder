You are transcribing one page of a language textbook into XHTML. The book exists only as pictures
of its pages, and your transcript replaces the picture: everything later reads your text and
never sees the image. Anything you leave out is lost, and anything you add is taught to someone
as if the book said it.

The page image is at: {{IMAGE_PATH}}

Open it with the Read tool and look at it closely. Small print matters, especially furigana. If
you need a closer look at part of the page, look again before you guess.

Book: {{BOOK_TITLE}}
This is page {{PAGE_NUMBER}} of {{PAGE_COUNT}}, inside "{{ENTRY_LABEL}}".

## Transcribe exactly

- Every piece of text on the page, in reading order, character for character. Do not translate,
  correct, tidy, summarize or complete anything. Keep the book's spelling, spacing between
  Japanese words, punctuation (。、「」・〜) and long vowels (Ohayoo stays Ohayoo).
- If you truly cannot read a character, write your best reading inside
  `<span class="unclear">…</span>`. Never leave a silent gap and never invent.

## Markup

Use plain XHTML, well formed. Escape `&` as `&amp;` and `<` as `&lt;` in text.

- **Furigana.** Small kana printed over a word is a reading. Write it as
  `<ruby>日本<rt>にほん</rt></ruby>`, one `<ruby>` per word the reading sits over. The reading
  goes in `<rt>` and never inline in the text. This is the most important rule on the page: the
  book prints readings over katakana in early lessons as well as over kanji, and both are ruby.
- **Headings.** The page's section titles in order of rank: `<h2>` for a major section (e.g.
  会話 Dialogue, 単語 Vocabulary, 文法 Grammar, 練習 Practice, Culture Notes), `<h3>` for a numbered
  exercise or grammar point (e.g. "Ⅳ でんわばんごう (Telephone Numbers)"), `<h4>` for a lettered
  sub-part. Keep the printed numeral or letter in the heading text.
- **Tables and column lists.** Anything laid out in columns is a `<table>`, one `<tr>` per row and
  one cell per column, including vocabulary lists (Japanese, reading, English) and greeting
  lists (Japanese, romanization, English). Use `<th>` only where the book prints a header row.
- **The lesson's vocabulary list** (the section a textbook titles Vocabulary, 単語 or たんご) is
  `<table class="vocabulary">`, every one of its tables, and no other table on any page. Later
  checks find a lesson's headwords by that class, so a vocabulary table without it is invisible
  to them and a grammar table with it is counted as vocabulary.
- **Lists of numbered items** (questions, example sentences): one `<p>` per item, starting with
  the printed number exactly as printed ("1.", "A.", "(1)"). If an item has a romanization line
  under it, put that in its own `<p class="romanization">` right after.
- **Dialogue.** One `<p>` per line, starting with the speaker as printed (`メアリー：`, `A：`).
- **Audio markers.** A speaker icon with a track code: `<span class="audio">K01-19</span>`.
- **Illustrations and photos.** `<figure><figcaption>[Illustration: what it shows]</figcaption></figure>`.
  If the picture carries words (speech bubbles, labels, signs, a clock face, a price tag),
  transcribe those words inside the figcaption; they are often part of an exercise.
- **Emphasis the book prints in colour or bold** that carries meaning (a highlighted particle, the
  changed part of a conjugation): `<em>`.
- **Blank lines and boxes for students to write in:** `<span class="blank"></span>`.
- **Footnotes and asterisk notes:** transcribe them where they are printed, as `<p class="note">`.

## Leave out

- The running header, the printed page number and the side tab. Report them in the attributes
  below instead of the body.
- Purely decorative elements (borders, background shapes, ornaments).

## Answer format

Reply with exactly one `<page>` element and nothing before or after it:

```
<page number="{{PAGE_NUMBER}}" printed="51" header="第1課" tab="会 L1">
<h3>…</h3>
<p>…</p>
</page>
```

`printed` is the printed page number (empty if none is printed), `header` is the running header
text, `tab` is the side tab text. Leave an attribute empty rather than guessing.
