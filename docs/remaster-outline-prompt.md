You are rebuilding the table of contents of a textbook whose EPUB is only pictures of its pages.
The EPUB's own table of contents is useless, so you are working from an OCR reading of the pages.

The book: {{BOOK_TITLE}}
It has {{PAGE_COUNT}} pages. "Page N" below always means the Nth image in reading order, never
the number printed on the page. The printed number usually differs by a fixed offset (front
matter is often unnumbered), and the margin lines below let you work that offset out.

## What you have

1. **The full OCR text of the first {{FRONT_PAGES}} pages**, where the book's printed contents
   page usually is, plus any later page that names several lessons (a book in parts often prints
   a contents page at the start of each part). OCR loses layout, so columns may be interleaved,
   but the characters are reliable. Take lesson titles from these pages, never from memory of the
   book.
2. **The margin lines of every page**: running headers, printed page numbers and side tabs. This
   is where each page says which lesson and which part of the book it belongs to. A page with no
   margin lines is usually a full-page illustration, a part divider or a blank.

## What to produce

A list of entries that covers every page from 1 to {{PAGE_COUNT}} exactly once, in order, with
no gaps and no overlaps. Each entry is one unit a learner would study as a whole: one lesson, or
one block of front matter, or one appendix.

- Split at lesson boundaries. A lesson's first page is where its title appears, and its last page
  is the page before the next lesson or section begins.
- Keep the book's own grouping. If a book has two parts that each number their lessons from 1
  (for example a conversation-and-grammar part and a reading-and-writing part), they are separate
  entries, and their labels must say which part they belong to.
- Front matter (cover, contents, introduction, how to use this book, character charts, greetings
  taught before lesson 1) and back matter (appendices, grammar indexes, vocabulary indexes,
  answer keys) are entries too. Split them where the book itself does, not into one lump.
- Use the printed contents page to name entries and find their printed start pages, then use the
  margin lines to convert printed page numbers into page numbers here. Check each boundary against
  the margins: the running header or side tab should change there.

## Labels

Labels become deck names and must be unique.

- A lesson in the book's main numbered sequence: `Lesson <n>: <English title>`, using the title
  the book prints (translate a Japanese-only title into short English).
- A lesson in a second numbered sequence that reuses the same numbers: put that part's English
  name first, e.g. `Reading and Writing <n>: <title>`. Never `Lesson <n>` for both.
- Anything else: the book's own heading, in English, e.g. `Greetings`, `Appendix: Grammar Index`.

## Kind

`kind` is one of `lesson`, `front-matter`, `back-matter`, `other`.

## Answer format

Reply with one JSON object and nothing else:

```json
{
  "printedPageOffset": 9,
  "entries": [
    {
      "label": "Lesson 1: New Friends",
      "kind": "lesson",
      "part": "Conversation and Grammar",
      "firstPage": 44,
      "lastPage": 65,
      "evidence": "contents lists Lesson 1 at p.35; page 44 is printed 35; header 第1課 from 44 to 65"
    }
  ]
}
```

`printedPageOffset` is page number minus printed page number where that is constant; use `null`
if it is not. `part` is `null` for a book with one part. `evidence` is one short line saying what
the boundary rests on, so a person can check it quickly.

## The OCR

### First {{FRONT_PAGES}} pages and later contents pages, full text

{{FRONT_TEXT}}

### Margin lines of every page

{{MARGINS}}
