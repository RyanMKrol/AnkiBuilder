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

Or click **Deliver to Anki** on the dashboard home page (previews, confirms, then delivers). Anki must be
open with the AnkiConnect add-on. It's safe to re-run — a second run is a no-op.

**It syncs with AnkiWeb automatically** (default; `--no-sync` to skip): a `sync` before delivery (pull — so
a review done on another device merges in before the push) and a `sync` after (push local → remote). A
content-only delivery syncs incrementally with no prompt. A **schema change** (adding a field, editing a
template) is the exception: Anki forces a one-way full sync gated behind its GUI **Upload/Download**
dialog, which AnkiConnect can't answer — the tool flags `schemaChanged` and you click **Upload to AnkiWeb**
once. Schema changes are rare (only when `FIELD_NAMES`/templates/CSS change), so this is a one-off.

## How notes are matched

Notes ↔ cards map by a durable `abid:<card.id>` tag; on the FIRST run un-tagged notes are matched by the
Japanese `Target` (falling back to `English` for shared-Target pairs, then a prefix match if a gloss was
edited since import), then stamped. Anything it can't resolve uniquely (a genuine duplicate, a
too-changed card) is **reported as ambiguous and left alone — never guessed, never duplicated**.

**Ambiguous skips fail the run.** When any cards were skipped as ambiguous, the script exits non-zero
(exit code 2) after printing a `⚠ ambiguous (skipped)` line per card, so a scripted or agent-driven
delivery cannot quietly report success while cards were left undelivered. Resolve the ambiguity (fix
the note or the card, or remove the duplicate) and re-run.

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
Update BOTH in the same commit; the `id` column is the key used there.

| probe | id | answer | recorded | what is gated on it |
|---|---|---|---|---|
| 1. template update regenerates a missing card row | `template-update-regenerates-card` | not yet run | | |
| 1. template update unsuspends | `template-update-unsuspends` | not yet run | | |
| 2. `changeDeck` on a card with non-zero `odid` | `change-deck-on-filtered` | not yet run | | `--refile` |
| 3. `suspend` on a card with non-zero `odid` | `suspend-on-filtered` | not yet run | | `--suspend-delivered` |
| 3. template update / Check Database unsuspends | `housekeeping-unsuspends` | not yet run | | `--suspend-delivered` |

## Rules for a collection managed this way

- The user marks cards reviewed live in Anki, and may edit decks between sessions. Re-read the
  on-disk deck files before every edit; never write from stale state.
- Prefer in-place delivery (this tool) over fresh `.apkg` imports for any deck the user already
  studies. A fresh import is only for a brand-new deck or a deliberate, discussed scheduling reset.
- Always let the tool take its backup; if you are about to do anything unusual to the collection,
  take one first (a delivery's backup snapshot doubles as a manual backup).
