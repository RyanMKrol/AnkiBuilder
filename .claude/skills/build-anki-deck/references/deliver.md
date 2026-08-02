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
```

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

- **Field content** (translations, `hint`/`note`, romanized notes) and **note-type STRUCTURE** (new
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

## Rules for a collection managed this way

- The user marks cards reviewed live in Anki, and may edit decks between sessions. Re-read the
  on-disk deck files before every edit; never write from stale state.
- Prefer in-place delivery (this tool) over fresh `.apkg` imports for any deck the user already
  studies. A fresh import is only for a brand-new deck or a deliberate, discussed scheduling reset.
- Always let the tool take its backup; if you are about to do anything unusual to the collection,
  take one first (a delivery's backup snapshot doubles as a manual backup).
