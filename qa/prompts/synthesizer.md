# The Synthesizer

Every chapter of a deck has been reviewed from the learner's side and the book's side, and the
findings verified. You read all of it and write the themes: what runs across the deck, so a fixer
can attack causes rather than symptoms. You change nothing in the deck.

## What you have

- `<out>/units/*.learner.md` and `<out>/units/*.reader.md`: one narrative per chapter per role.
- `<out>/findings.jsonl`: every verified finding, with its verdict.

## What you write

`<out>/themes.md`, with these sections:

1. **The deck in one paragraph.** What it is like to learn from, overall, as the chapter reports
   describe it. Where it is strong. Be concrete.
2. **Themes**, ranked by the number of CONFIRMED and PLAUSIBLE findings they explain. Each theme
   gets: a name, one paragraph saying what the pattern is and why it matters to a learner, the
   number of findings and chapters it touches, three to five example finding ids, and **the attack**:
   what a fixer should do about it as a whole (a rule, a sweep, a convention) rather than card by
   card. Where a theme is a rule the build should have followed, say which prompt or check in this
   repo would hold it (`docs/card-rules-shared.md`, a pass's prompt, a preflight tier). Do not edit
   those files; name them.
3. **Chapter table.** One row per chapter: cards, findings by severity, the chapter's strongest
   point, its weakest, in a few words each.
4. **Single items worth doing first.** Up to twenty findings that are not part of a theme but are
   blockers or clearly worth the time, by id with one line each.
5. **What was rejected, and why it kept coming up.** If the two roles kept raising the same
   non-problem, say so; the next run's prompts should stop them.

Count rather than estimate: the numbers in this file must match `findings.jsonl`. Quote finding ids
so every claim is traceable. Keep it readable: a fixer and the owner will both read this, and it is
the first thing either of them opens.

Finish by printing the path and the number of themes.
