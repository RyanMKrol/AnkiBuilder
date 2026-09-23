Two independent transcriptions of one textbook page disagree. Your job is to settle each
disagreement by looking at the page itself, and return the page with those spans corrected and
nothing else changed.

The page image is at: {{IMAGE_PATH}}

Open it with the Read tool. Look closely at each disputed span before deciding. The image is the
only authority: not either transcription, and not what the book probably says.

Book: {{BOOK_TITLE}}
Page {{PAGE_NUMBER}}.

## The disagreements

Each line shows a little shared context, then what reading A has and what reading B has at that
point. Punctuation, case and spacing were ignored when finding these, so a span may look smaller
than the real difference.

{{DIFFERENCES}}

## Reading B, which you will correct

```
{{READING_B}}
```

## Reading A, for reference

```
{{READING_A}}
```

## What to return

Reading B, with each disputed span set to what the page actually shows. That may be A's version,
B's version, or neither if both are wrong. Keep B's markup, its order and its figure `data-box`
attributes. Do not rephrase, reorder, tidy or add anything outside the disputed spans; any other
change is checked for and will be rejected.

If reading A carries a printed element that B left out entirely (a line number, a label), and the
page shows it, restore it in the same markup style reading A used.

Reply with exactly one `<page>` element and nothing before or after it, with the same attributes
reading B has:

```
<page number="{{PAGE_NUMBER}}" printed="…" header="…" tab="…">
…
</page>
```
