# Delivering to Anki: deliver-to-anki, backups, and restore

How on-disk deck state reaches the user's live Anki collection without touching their scheduling.
The workflow spine ([SKILL.md](../SKILL.md) Step 7) has the short version; load this file before any
delivery, restore, or backup question. The user studies daily, so protecting review progress is the
top rule here: back up first, prefer in-place updates over fresh imports, and never guess.

## The deliver tool

**Deliver changes to Anki with the deliver tool — don't drag-and-drop `.apkg`.** `scripts/deliver-to-anki.mjs`
(module `src/anki/deliver.js`) pushes the on-disk corpus state into the running collection over
AnkiConnect, deterministically and idempotently: it backs up every managed deck (with scheduling) + a
note-type snapshot, force-syncs the note type to the code's canonical `noteTypeSpec` (fields/templates/CSS
— the SAME definition the `.apkg` uses, exported from `src/deck/collection.js`), then updates each note's
fields **in place by GUID** (`updateNoteFields` — touches only fields, never scheduling) and adds any new
cards. Run it dry first to preview:

```sh
node scripts/deliver-to-anki.mjs --dry            # preview every managed deck (read-only)
node scripts/deliver-to-anki.mjs                  # back up, then deliver
node scripts/deliver-to-anki.mjs course:my-course # limit to one deck (type:id)
node scripts/deliver-to-anki.mjs --allow-model-change   # consent to a template/CSS rewrite
node scripts/deliver-to-anki.mjs --allow-bulk-add       # consent to adding >200 notes at once
node scripts/deliver-to-anki.mjs --dry --refile         # preview a deck-name re-file
node scripts/deliver-to-anki.mjs --dry --suspend-orphans # preview retiring dropped cards
```

**Run `npm run check` before a deliver.** It is `ci && validate:decks && preflight`, the full
deterministic gate over both the code and the on-disk deck state.

### The note type is shared, so a template change is refused unless you ask for it

The note type is keyed on LANGUAGE alone (`AnkiBuilder ja`), which means every Japanese deck in the
collection shares one: delivering the three-lesson course rewrites the card faces of the 2,000-card
book at the same moment. That sharing is correct and stays. What was missing was any warning before
the write.

So a delivery that would change **card templates or CSS** now stops:

- `--dry` prints a unified diff of what is live in Anki against what this build would write, plus
  every deck using that note type and how many cards that is. It writes nothing.
- A real deliver refuses unless you pass `--allow-model-change`.
- Adding a FIELD, and creating the note type from scratch, are NOT gated: neither can change what an
  existing card looks like.

Remember that a template or CSS change also flips Anki's schema, which forces the one-way full
AnkiWeb sync you have to finish by hand in the GUI.

**A card template the live note type does not have is a different case, and it FAILS.** AnkiConnect's
update action addresses templates by name on an existing note type: handed a name that is not there,
it reports success and creates nothing. So a build defining a template Anki has never seen stops the
deliver and tells you to create the card type by hand first (Tools → Manage Note Types → Cards →
Options → Add Card Type, named exactly as the message says), then re-run so the front and back are
pushed from the build. There is a guarded `--allow-template-add` path in the code, and it is closed:
adding a template generates a new card on every existing note of that language, and nothing has yet
established whether that write also clears the direction suspensions it lands on.

Or click **Deliver to Anki** on the dashboard home page (previews, confirms, then delivers). Anki must be
open with the AnkiConnect add-on. It's safe to re-run — a second run is a no-op.

The button passes no flags, so anything that needs consent — a template/CSS change, a first delivery
of more than 200 cards, `--refile` — has to go through the CLI. That is deliberate: a consent flag
you can click without reading is not consent. The button reports the refusal and its reason.

**It syncs with AnkiWeb automatically** (default; `--no-sync` to skip): a `sync` before delivery (pull — so
a review done on another device merges in before the push) and a `sync` after (push local → remote). A
content-only delivery syncs incrementally with no prompt.

**ADDING a field or a card template** is the exception. That reshapes every existing note, so Anki forces
a one-way full sync behind its GUI **Upload/Download** dialog, which AnkiConnect cannot answer: the tool
flags `schemaChanged` and you click **Upload to AnkiWeb** once.

**Editing an existing template's HTML, or the CSS, is not that**, and does not need the click. Measured on
2026-08-17: a delivery that rewrote both templates and the whole stylesheet synced incrementally, and Anki
never prompted. The flag used to fire on those edits too, which sent the owner looking for a dialog that
was never going to appear. If you ever do see Anki's Upload/Download dialog, choose **Upload to AnkiWeb**:
the local collection is the one that just received the delivery, and Download would discard it.

## How notes are matched

Notes ↔ cards map by a durable `abid:<card.id>` tag; on the FIRST run un-tagged notes are matched by the
Japanese `Target` (falling back to `English` for shared-Target pairs, then a prefix match if a gloss was
edited since import), then stamped. Anything it can't resolve uniquely (a genuine duplicate, a
too-changed card) is **reported as ambiguous and left alone — never guessed, never duplicated**.

The two lookups have deliberately different scopes, and the difference is load-bearing:

- the **`abid:` index is read BOOK-WIDE** and must never be narrowed. It is the only durable link
  between a card on disk and a note in Anki, so a delivered note you moved, or one under a
  differently-named sub-deck, still has to be findable. Narrow it and that note falls out of the
  index, the card reads as new, and the tool adds a duplicate with fresh scheduling beside a matured
  original it merely prints as `orphaned`.
- the **first-run fingerprint indexes are read PER UNIT**. Book-wide they cross-bind: 17 targets
  repeat across this book's units, so a unit's card could adopt another unit's note by spelling
  alone.

That scoping opens one window, and a **second pass** closes it: on a first run an untagged note
sitting under an OLD deck name is in no unit's index, so its card would otherwise be added rather
than adopted — a duplicate with no scheduling beside the matured original. After every unit has
claimed what it could, a book-wide pass adopts any note that is still unclaimed AND uniquely
identified, tags it, and says so. Running it second is what keeps the cross-bind closed: where two
units' cards share a target, both candidates are already claimed or still ambiguous by then, so
neither card can take the other's note by being processed first.

Where that pass cannot pick exactly one, the card is still added — and the note ids it saw are
printed, so an add that something looked like is never silent. If the deck NAME is what moved,
`--refile` puts the adopted notes back where they belong.

**Ambiguous skips fail the run.** When any cards were skipped as ambiguous, the script exits non-zero
(exit code 2) after printing a `⚠ ambiguous (skipped)` line per card, so a scripted or agent-driven
delivery cannot quietly report success while cards were left undelivered. Resolve the ambiguity (fix
the note or the card, or remove the duplicate) and re-run.

## The four guards on a routine deliver

None of these is optional and none can be turned off with a flag alone. They exist because the same
routine command, run against a collection something has happened to, is how the whole book gets
re-inserted as fresh notes with no scheduling.

1. **The rename guard.** The tool finds notes by the parent deck's NAME, which is the book title and
   is editable in Anki. If `anki-delivered.json` says this collection was delivered and the lookup
   finds ZERO notes under that name, the run **aborts** and says the deck was probably renamed.
   Before this, that case read as "a brand-new collection" and re-added everything.
2. **The fail-closed baseline.** Every real deliver records `deliveredCardIds` in the marker: the
   cards it resolved to a real note. The next run looks each one up by its `abid:` tag and aborts if
   more than 10% have vanished (at least 3 of them, so a small collection is not tripped by one
   hand-deleted note) — or if ALL of them have, at any size. A collection whose marker has no
   `deliveredCardIds` yet — both of yours, until their next deliver — **records the baseline and
   asserts nothing**. The gate arms from the second run. There is deliberately no flag to force past
   it: if you know why those notes are gone, delete the `deliveredCardIds` field from
   `anki-delivered.json` and the next run re-records it.
3. **The add ceiling.** More than 200 additions to one collection needs `--allow-bulk-add`. A run
   that size is either a first delivery or a matching failure, and they look identical from here.
   `--dry` previews the number without refusing.
4. **A falsy backup is a failed backup — for a collection that has been delivered before.**
   AnkiConnect answers `{result: false}` with no error when the deck it was asked to export does not
   exist, so a backup of a renamed deck used to record a success. The delivery now aborts before
   touching anything. On a collection that has NEVER been delivered the same answer means something
   ordinary — the parent deck does not exist yet, because this deliver is what creates it — so the
   run says so and continues.

If the marker write itself fails after a delivery, the run does not fail (the notes are already
written) — it prints a warning and leaves the marker with NO baseline, so the next run bootstraps a
fresh one instead of checking against a stale one.

## What it does / doesn't do

- **Field content** (translations, `scene`/`hint`/`note`, romanized notes) and **note-type STRUCTURE** (new
  field like `Note`, template/CSS changes, the category chip, the front `hint`) → both applied in place,
  **scheduling preserved**. (Structure changes never land on a plain `.apkg` re-import — this tool is how
  they reach Anki.)
- **New cards** → added, with their audio if a clip exists on disk (generate audio in the dashboard
  first; new cards without audio are added silent and flagged in the report).
- **Card ORDER** (the jumble/reorder) → NOT delivered; new-card position can't be set in place and barely
  matters for already-studied cards. A fresh import is the only way, and it's rarely worth the scheduling
  reset.
- **Deletions** → never automatic; a note whose card left the corpus is reported as `orphaned` for you to
  remove by hand.
- **Card DIRECTION** (`dirSuspended` on a card) → applied by SUSPENDING the unwanted ordinal, and only
  under the consent rules below.

## Per-card direction: `dirSuspended`

A card can name the directions it should not be studied in, by template ordinal — `dirSuspended: [1]`
means "Recognition only". 0 is Recognition, 1 is Production; that order is a contract
(`src/deck/cardTemplates.js`). Suspending every direction is refused by name: a note with no studiable
card is what `excluded` is for.

Suspension is the mechanism because the two obvious alternatives are actively harmful. Gating a
template's front on a field produces an **empty card**, which Anki's Tools → Empty Cards deletes along
with its interval and its whole review log. Omitting the card row at build time is **inert** on this
path (`addNote` makes Anki generate one card per template) and **self-reversing** on the `.apkg` path
(Check Database and any template update regenerate it). Suspension is the only per-note direction
suppression that survives routine housekeeping.

**Stated consequence:** the `.apkg` keeps emitting both card rows while this path suspends one, so a
built package deliberately no longer reproduces the delivered deck card-for-card.

Who gets suspended, and what consent that needs:

| the note | what happens | flag |
|---|---|---|
| created by THIS deliver | suspended unconditionally, tagged `dir-suspended::<ord>`, reported like `createdDecks` | none — a card that has never been studied has no scheduling to disturb |
| already in the collection | **not touched**; the unapplied flags are reported | `--suspend-delivered`, **currently refused** (see below) |
| unsuspended by hand, still carrying its `dir-suspended::<ord>` tag | reported and left alone, forever | `--re-suspend-human-unsuspended` overrides that one-click human decision |

**`--suspend-delivered` is hard-disabled.** It is gated on two probe answers that have not been
recorded: `suspend-on-filtered` (what `suspend` does to a card with a non-zero `odid`, i.e. one pulled
into a filtered deck) and `housekeeping-unsuspends` (whether a template update or Check Database
clears the suspension, which would make the control quietly stop working). Passing the flag today
raises an error naming both and pointing at the probe script; it never reaches the collection. The
gate reads `src/anki/probeResults.js`, so "gated on a probe" means gated on a recorded RESULT, not on
a memory that somebody once ran something. Record an answer in BOTH that file and the table below, in
the same commit.

## Importing an .apkg: note guids and the one rule that matters

A note's **guid** is how Anki decides at import whether it already has that note, and it matches
guids **collection-wide** — across every deck, not just the one being imported. This tool writes a
card's own id as the guid, so what that id looks like decides how far an import reaches.

**New collections are namespaced.** A book or course created from now on records a `guidNamespace` in
its `book.json` / `course.json` at creation, taken from its immutable folder **slug**, and its
package writes `<namespace>/<card id>`. Deliberately the slug and not the display title: a namespace
that followed a rename would change every guid and orphan the live scheduling of every card. A
bundled template or one-off run dir has no marker, so its namespace comes from the same immutable
directory identity its package is named after (`numbers-ja` for `templates/numbers/ja`).

**The two collections delivered before that existed keep bare guids, and are not being retrofitted.**
Renumbering their guids now would make every note look new. Their protection is this rule:

> **Never `.apkg`-import a bare-guid deck into an Anki collection that already holds another
> bare-guid deck from this tool.** If both packages ship bare ids, any card id they happen to share
> lands on the other deck's note.

`npm run preflight` prints which mode each collection is in (`guid namespace`). Delivering over
AnkiConnect is unaffected either way: it is scoped to the collection's own deck tree and matches
notes by their `abid:` tag, never by guid.

The retrofit stays deferred until `scripts/verify-apkg-import.mjs` has shown what a guid change
actually does to the restore path — that is the trigger recorded in LIMITATIONS.

## Moving notes between collections: why `--refile` is not the tool

`--refile` moves a delivered card whose deck no longer matches its unit, and it is gated on the
unanswered `change-deck-on-filtered` probe. It also only ever looks WITHIN one collection's deck
tree, because the `abid:` index it works from is built by one query scoped to that collection's
parent deck.

So it cannot help with the other case: a note that has to move BETWEEN collections, because the card
it belongs to was relocated from one product into another. The book's deliver cannot see a note
sitting under another parent deck at all. Such a card reads as new, gets added with fresh scheduling,
and the matured original is merely reported as `orphaned`. The fix is to move the notes into the
target tree BEFORE delivering, so the next deliver resolves them by `abid` and updates them in place.

That is a migration, not a standing control, and it is written as one:
`scripts/migrate-nihongo-absorption.mjs` did it once for the Nihongo 101 absorption. If you ever need
another, copy its shape rather than reaching for a flag:

- snapshot `due`, `ivl`, `factor`, `reps`, `lapses`, `queue` and `type` for every affected card,
  re-read them after the move, and abort unless every field of every card still matches. `changeDeck`
  is documented as leaving scheduling alone, and that is not something to take on trust with a daily
  learner's collection.
- skip and report any card with a non-zero `odid`, for the same unanswered probe that gates
  `--refile`. Do not guess.
- keep the card ids identical. The id IS the `abid:` tag, so changing it is what orphans the note.
- default to a dry run and require an explicit flag to write.

**Deck membership selects the options preset, which is scheduling behaviour.** Existing intervals
survive the move; how the cards are scheduled from then on follows the destination deck's preset.
That is usually the point of the move, but it is a real consequence and worth saying out loud.

## Deck options: turn on sibling burying by hand, once

**This is the one setting in this file that has to be clicked in Anki, and it is worth more than
anything the tool can do for you.** Every note here makes two cards, Recognition and Production.
With burying off they come up in the same session, so the second is answered from working memory
rather than recalled — roughly halving what a two-direction note teaches.

In Anki: open the deck's options (the gear beside the book deck > **Options**), and under **Burying**
tick **Bury new siblings** and **Bury review siblings**. Do it on the preset the book decks use;
Anki applies a preset to every deck assigned to it, so one edit covers the whole book.

The `.apkg` cannot do this for you on a deck you already have. **AnkiConnect never writes deck
options**, so nothing the deliver tool does touches your scheduling settings, and both of your
collections were delivered that way. The package's own options are fresh-import hygiene only: it
ships a preset named `anki-builder` (id 1000001) with burying already on, and every deck it builds
points at that one — deliberately NOT at `Default` (id 1), which is a preset your collection already
has and which would push our choices onto every deck we never built. The package also interleaves
new-card positions so a note's two directions are not adjacent in the new queue even before burying
is on.

## Two opt-in steps: `--refile` and `--suspend-orphans`

Both are off by default, both preview under `--dry`, and **both refuse to run today** because the
live-Anki probes that would say what they do to a card in a filtered deck have never been answered
(see the results table below). The preview is not gated: it reads and prints.

```sh
node scripts/deliver-to-anki.mjs --dry --refile           # every move it WOULD make
node scripts/deliver-to-anki.mjs --dry --suspend-orphans  # every note it WOULD suspend
```

**`--refile`** moves a delivered card whose current deck no longer matches its unit's deck name. It
is the only way a `chapterLabel` correction reaches an existing book without splitting one chapter
across two decks, because renaming a deck in Anki makes a NEW deck. It is opt-in rather than
automatic because deck membership selects the options preset, which is the scheduling behaviour: a
silent re-file changes how the cards are studied. Two skips, both reported:

- a card in a **filtered deck** (non-zero `odid`). Anki's `deck:` search matches such a card by its
  HOME deck while `cardsInfo` reports the filtered one, so it reads as "deck differs" and a move
  would yank it out of a custom-study session mid-review.
- a card **outside this collection's own deck tree**. Inside the tree, a differing deck means a
  stale unit name. Outside it, somebody put that card there deliberately.

**`--suspend-orphans`** suspends and tags (`ab-orphaned`) delivered notes whose card id has left the
corpus — today they are only listed. Suspending keeps the card, its interval and its whole revlog,
and one click reverses it; leaving it is a card you drill forever, and deleting it destroys history.
It skips filtered-deck cards the same way `--refile` does.

⚠️ **"Orphaned" means "not in a DONE unit", not "not in the book."** Pull a unit back out of the
shipping deck with `undone-unit.mjs` and every one of that unit's live notes reads as an orphan here.
That is the case to check the preview for before ever running it.

### The one-time deck-name migration

The plan is to run the re-file exactly once, deliberately, against the existing book after the entity
decoding fix changes its deck labels. The sequence, when the probes are in:

1. `node scripts/deliver-to-anki.mjs --dry --refile book:<slug>` and read every proposed move.
2. Confirm the moves are the rename you expect, and that the skipped list is only filtered cards.
3. Re-run without `--dry`. The pre-delivery backup covers you; the restore path is above.

## Backups

Before any real delivery (never on `--dry`), the tool snapshots every managed deck into
`anki-backups/<stamp>/` (override the root with `ANKI_BUILDER_BACKUP_ROOT`): one full-scheduling
`.apkg` per deck, a `models.json` note-type snapshot, and a `manifest.json` describing the snapshot.
The backup is fail-closed: if any deck's backup fails, the delivery aborts before making changes.

Snapshots are pruned automatically after each backup: the newest 10 are kept
(`ANKI_BUILDER_BACKUP_KEEP` overrides the count) plus the newest snapshot of each older week. Recent
history is what a panic restore reaches for; older history only needs coarse granularity. Before
pruning existed the backup dir had grown to ~780 MB across 41 runs.

## Restoring from a backup

`scripts/restore-anki-backup.mjs` restores deck(s) into a running Anki from a snapshot:

```sh
node scripts/restore-anki-backup.mjs --list                    # every snapshot, newest first
node scripts/restore-anki-backup.mjs <stamp> [deckName ...]    # preview the restore plan
node scripts/restore-anki-backup.mjs <stamp> [deckName ...] --yes   # actually restore
```

A restore must DELETE the live deck first, then import the backup `.apkg`. Importing over a live deck
does NOT overwrite existing notes' scheduling or content: it looks like it worked and restores
nothing. That non-obvious two-step is exactly why this script exists; use it rather than importing a
backup by hand. Anki must be open with AnkiConnect. After a restore, do NOT sync blindly: if the bad
state already reached AnkiWeb, choose **Upload to AnkiWeb** so the restored local copy wins.

## Live-AnkiConnect behaviour probes (a SEPARATE profile, never yours)

Three questions about delivery cannot be answered without a live collection, and until they are
answered nothing that depends on them may ship:

1. Does a template update regenerate a card row the `.apkg` writer omitted, and does it UNSUSPEND
   anything? (Per-card direction control depends on this.)
2. What does `changeDeck` do to a card sitting in a FILTERED deck, with a non-zero `odid`? (The
   one-time deck-name re-file depends on this.)
3. What does `suspend` do to a card with a non-zero `odid`, and does a template update or a Check
   Database bring it back?

`scripts/anki-behaviour-probe.mjs` answers them. **It performs experimental schema-modifying writes,
deck moves and suspends.** AnkiConnect listens on `127.0.0.1:8765` and talks to whichever profile is
OPEN, and the add-on is installed for the whole INSTALLATION, so it is live in every profile
including the one you study daily.

### The interlock

The guard is not this runbook. It is a fail-closed interlock checked at startup **and re-checked
immediately before every write**, because a profile switch mid-run is exactly the accident it exists
to catch. All four must hold:

| | condition | why this one |
|---|---|---|
| (a) | no note type matches `AnkiBuilder …` | a pattern, not today's two names, so a rename cannot defeat it |
| (b) | `findNotes("tag:abid:*")` returns zero | the durable delivery tag survives a note-type rename, catching what (a) misses |
| (c) | the deck `ANKIBUILDER-PROBE-ONLY` exists AND the collection holds under 200 **cards** | cards, not notes: a two-template note type makes 150 notes into 300 cards, and it is cards these probes move |
| (d) | no deck matches a delivered marker's `ankiParent` | the last line: your real decks by name |

Any one failing stops the run and writes nothing. **Never relax the interlock to make a run work.**
If it refuses, the reachable collection is not the probe profile.

### What you do by hand (never scripted)

1. Anki: **File > Switch Profile > Add**, name it exactly `ANKIBUILDER-PROBE`, open it.
2. In that profile, create a deck named exactly `ANKIBUILDER-PROBE-ONLY`.
3. Add two or three trivial notes to it, then **Tools > Create Filtered Deck** from
   `deck:ANKIBUILDER-PROBE-ONLY`, named exactly `ANKIBUILDER-PROBE-FILTERED`. Probes 2 and 3 need a
   card with a non-zero `odid`, and they SKIP rather than guess if it is not there.
4. Run the probes.
5. **File > Switch Profile** back to your own.

Resetting between sessions is step 1 again: delete the probe profile and recreate it. That deletion
stays a human step forever. A script that can delete a profile is a script that can delete the wrong
one, and no interlock makes that safe. The script also creates its own note type (`PROBE-ONLY Note`)
only AFTER the interlock passes, and deliberately shares no prefix with the deliverable one, so a
second run cannot refuse itself.

```sh
node scripts/anki-behaviour-probe.mjs --check     # interlock only; writes NOTHING. Always start here.
node scripts/anki-behaviour-probe.mjs --run       # the probes
node scripts/anki-behaviour-probe.mjs --run --json
```

There is no default action: a bare invocation prints usage and exits non-zero, so a mistyped flag
cannot turn into a write.

### Results

Record the answers here, dated, as soon as a session produces them. Anything gated on a probe reads
this table, not a memory of a run.

The machine-readable copy is `src/anki/probeResults.js`, and that is what a gate actually consults.
Update BOTH in the same commit; the `id` column is the key used there. A test fails if an id exists
in one and not the other. Nothing writes either half automatically — a probe result is read and
judged by a human, and a gate that could arm itself from a script's output would be arming itself
from the thing it exists to check.

| probe | id | answer | recorded | what is gated on it |
|---|---|---|---|---|
| 1. template update regenerates a missing card row | `template-update-regenerates-card` | **no** — row count unchanged after `updateModelTemplates` on a note with a deleted card row | 2026-08-17 | `--allow-template-add` |
| 1. template update unsuspends | `template-update-unsuspends` | **no** — a suspended card was still suspended after the template write | 2026-08-17 | `--allow-template-add` |
| 2. `changeDeck` on a card with non-zero `odid` | `change-deck-on-filtered` | not yet run | | `--refile` |
| 3. `suspend` on a card with non-zero `odid` | `suspend-on-filtered` | not yet run | | `--suspend-delivered`, `--suspend-orphans` |
| 3. template update / Check Database unsuspends | `housekeeping-unsuspends` | not yet run | | `--suspend-delivered`, `--suspend-orphans` |

Every unanswered one refuses, naming the evidence it lacks. The `--dry` previews are NOT gated:
they read, print, and write nothing.

The three remaining probes all need a card with a non-zero `odid`, which means a **filtered deck**,
and AnkiConnect exposes no way to create one (`apiReflect` lists `createDeck` only). So that part of
the session is a human step, once:

1. Switch to the throwaway profile. The name is advisory, not enforced: the interlock checks the
   collection, not the profile name, so any empty profile works (`Claude Test Profile` was used on
   2026-08-17).
2. The sentinel deck `ANKIBUILDER-PROBE-ONLY` already holds two probe cards after a `--run`. If it is
   empty, run `node scripts/anki-behaviour-probe.mjs --run` once to create them.
3. Tools > Create Filtered Deck. Name it `ANKIBUILDER-PROBE-FILTERED`, set the search to
   `deck:ANKIBUILDER-PROBE-ONLY`, turn off "Reschedule cards based on my answers" if you want the
   least invasive version, and Build.
4. `node scripts/anki-behaviour-probe.mjs --run` again. Probes 2 and 3 then answer, which also
   answers `housekeeping-unsuspends` (it is measured inside probe 3).
5. Record the answers here and in `src/anki/probeResults.js`, then switch back to your own profile.

## Rules for a collection managed this way

- The user marks cards reviewed live in Anki, and may edit decks between sessions. Re-read the
  on-disk deck files before every edit; never write from stale state.
- Prefer in-place delivery (this tool) over fresh `.apkg` imports for any deck the user already
  studies. A fresh import is only for a brand-new deck or a deliberate, discussed scheduling reset.
- Always let the tool take its backup; if you are about to do anything unusual to the collection,
  take one first (a delivery's backup snapshot doubles as a manual backup).
