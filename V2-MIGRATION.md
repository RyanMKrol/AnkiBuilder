# v2 migration: temporary rules

**DELETE THIS FILE when `v2` merges into `main`.** Everything in it is scoped to the period while
v2 is being written and `main` still carries a working v1. `CLAUDE.md` refers to this file _by its
existence_, so deleting it is the single act that returns the repo to its normal conventions. No
other file needs editing at merge time, which is the point: a rule that expires should not live
inside a document that survives.

**Is this file stale?** Run `git ls-remote --heads origin v2`. If it prints nothing, the v2 branch
is gone, the migration is over, and this file should already have been deleted. Delete it now.

## Where work happens

- **All v2 work goes on the `v2` branch**, or on short branches taken off `v2` and merged back into
  `v2`. Nothing about v2 lands on `main` until the whole thing lands.
- **`main` is v1, and it stays runnable.** It takes v1 maintenance only: finishing chapters of a book
  in progress, audio regeneration, deliver-to-Anki fixes. If a change would only make sense in v2, it
  belongs on `v2`.
- This is a deliberate carve-out from **golden rule 1** ("a fresh branch off the latest `main` for
  each atomic task"). That rule assumes short branches and still governs work _within_ each
  generation, so take a short branch off `v2` per task exactly as you would off `main`. What changes
  is only the trunk those branches return to.

## The deck data is shared, and v2 must not touch it

`output/` and `.anki-builder/` are not part of either generation. They are the product: 34 units and
2,453 reviewed cards, delivered to a collection studied daily.

**The `v2` branch never modifies a file under `output/` or `.anki-builder/`.** Not to test, not to
try a migration, not to fix a card. The reason is specific rather than tidy: 93 files under
`output/` and 20 under `.anki-builder/` are _tracked in git_ (see `.gitignore`, which explains why),
so any change on `v2` diverges from the same file on `main`. If `main` reviews a chapter while `v2`
holds an older copy, merging `v2` later reverts that review, and per `.gitignore`'s own note those
files are "months of human review living on exactly one disk, with no backup anywhere".

When v2 needs deck data to run against, copy it to a scratch directory outside the repo and point
the code there. Never write back.

## Keep `v2` current with `main`

`main` keeps moving while v2 is written, so merge it in regularly rather than diverging for weeks:

```sh
git fetch origin && git merge origin/main
```

Resolve conflicts preserving both sides' intent, per CLAUDE.md's "Working alongside other agents".
Conflicts inside `output/` mean the rule above was broken; take `main`'s side without exception, and
find out what wrote to it.

## Merging v2 back into `main`

Do these in order:

1. `git fetch origin && git merge origin/main` on `v2`, and resolve everything.
2. `npm run ci` green on the merged result.
3. `npm run validate:decks` and `npm run preflight` green, so v2 is proven against the real deck
   state before it owns it.
4. Confirm `git diff main...v2 -- output/ .anki-builder/` is **empty**. Anything here is a
   divergence that must be resolved in `main`'s favour before merging.
5. Rewrite the parts of `CLAUDE.md`, `README.md`, `docs/PIPELINE.md` and `.claude/skills/` that
   describe v1's architecture. They are accurate for v1 today and will be wrong the moment v2 lands.
6. Merge into `main`, and tag the result `v2`.
7. **Delete this file.** That is what switches `CLAUDE.md` back to standing on its own.
