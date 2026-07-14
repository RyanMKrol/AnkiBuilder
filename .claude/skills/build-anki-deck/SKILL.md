---
name: build-anki-deck
description: Build an Anki deck from travel phrases, template, or custom EPUB
---

# Build an Anki Deck

This skill guides you through building a complete Anki flashcard deck for vocabulary practice.

## Getting Started

### Prerequisites

- A run directory where artifacts will be stored
- Optional: `.env` file with `ELEVENLABS_API_KEY` (see [Setup](#setup))
- Optional: an EPUB file if building from a book

### Setup

If you want to generate audio (ElevenLabs TTS), you need an API key:

1. Get an API key at https://elevenlabs.io
2. Create a `.env` file in your working directory by copying `.env.example`:
   ```sh
   cp .env.example .env
   ```
3. Add your key to `.env`:
   ```
   ELEVENLABS_API_KEY=sk_...your_key...
   ```

The CLI loads `.env` automatically — no need to export by hand. The file is gitignored and stays on your machine.

## Workflow

### Step 1: Corpus Source — Template or EPUB?

Tell me which:

1. **Bundled template** (ready-made travel vocabulary): `travel-essentials`
2. **Your own EPUB**: path to an .epub file on your machine

If you choose a template, I'll assemble the corpus immediately. If you choose an EPUB, I'll extract candidate terms and ask which target language to prepare translations for.

### Step 2: Corpus Assembly & Review

Once the source is decided, I'll assemble the corpus:

```sh
anki-builder assemble --run <runDir> [--template travel-essentials | --epub <path> --lang <lang>]
```

The result is `corpus.json` in your run directory, containing:
- English phrases (the terms to memorize)
- Categories (Greetings, Food, etc.)
- Optional translations or hints from the source

**Review gate — always render as a Claude Artifact, never just print a table in chat/terminal:**
Read `corpus.json` and build an HTML review table, then publish it as an Artifact (load the
`artifact-design` skill first — this is a utilitarian data-review tool, polished but not
over-designed). Columns: #, English, Category, Target (if the source already populated it, e.g.
the EPUB path), Notes. Make each row clickable to mark it for exclusion (visual only — strikethrough
+ dim), with a running "N marked" counter and a "Copy instruction" button. Don't skip this even for
a small corpus — a terminal dump is not an acceptable substitute; the point is that it's actually
visible and scannable in the browser.
Keep the table header row static (no `position: sticky`) — sticky positioning on `thead th` breaks
inside a horizontally-scrolling wrapper (`overflow-x: auto` on the table's container implicitly
turns that container into the sticky containing block, so the header detaches and floats mid-table
instead of pinning to the top). A plain, non-sticky header is correct here; don't reintroduce it.
The copy button must put a ready-to-paste instruction on the clipboard, not bare numbers — e.g.
`Please exclude rows 3, 12, 19.` (or `No rows marked for exclusion.` when nothing's marked), so the
result can go straight back into chat with no editing. `navigator.clipboard.writeText` is often
blocked inside the artifact's sandboxed iframe and silently throws — always try it first, fall back
to a hidden-textarea `document.execCommand("copy")` on failure, and if BOTH fail, reveal the text in
a visible, pre-selected, read-only input so it can be copied by hand. Never let a copy failure be
silent (e.g. don't just overwrite the button's own label with the text).

**You decide:** does the corpus look right?

If you want to edit the corpus (add, remove, or fix terms), do it now in `corpus.json` before
proceeding, or tell me which numbers to exclude. Once you give a decision — a list of numbers to
exclude, or none — run `anki-builder review --run <runDir>` to apply it, then move straight on to
`translate` in the same turn. Don't stop to ask "should I proceed with translation?" first — telling
me the exclusions (or that there are none) IS the go-ahead. Only pause again if something in
`translate`'s own output needs a decision (e.g. errors).

### Step 3: Translation via Claude

Translate the corpus to the target language using `claude -p` (the local Claude tool):

```sh
anki-builder translate --run <runDir>
```

This:
- Reads `corpus.json`
- Generates translations and pronunciations for each phrase
- Writes `cards.json` (the translated cards, ready for audio/images)

**Review gate — publish a new Claude Artifact (don't reuse the corpus-stage one, the data's
different now).** Read `cards.json` and build a review table, same visual system as the corpus
review (same tokens/fonts, same "no `position: sticky` on `thead th`" rule, same robust
copy-with-fallback button — see Step 2 for the concrete requirements, they apply here unchanged).
Columns: #, English, Target, Pronunciation, Category, Notes. Same click-to-mark-for-exclusion
interaction, copying `Please exclude rows 3, 12, 19.` — but note the mechanism differs from Step 2:
there's no `anki-builder review` equivalent for `cards.json`, so acting on this means directly
removing those entries from `cards.json` and re-validating it, not running a CLI command.

If you want to edit translations or pronunciations, do it in `cards.json` now before proceeding.
Once you give a decision, apply it and move straight into Step 4 in the same turn — same
no-separate-confirmation rule as the assemble → translate transition.

### Step 4: Audio Generation

If you want to generate audio (pronunciation recorded by ElevenLabs TTS):

```sh
anki-builder audio --run <runDir> --voice <voiceId>
```

This:
- Requires `ELEVENLABS_API_KEY` in your environment (or `.env`)
- Reads `cards.json`
- Fetches audio from ElevenLabs for each card
- Caches audio in `.anki-builder/audio/<voiceId>/` (inside this repo, gitignored) so reruns are fast
- Copies audio files into the run directory
- Writes updated `cards.json` with audio file references

**Voice choice:** I'll help you pick a voice. Available voices vary by language. Popular choices:
- For English: `21m00Tcm4TlvDq8ikWAM` (Bella), `EXAVITQu4vr4xnSDxMaL` (Premom)
- For other languages, visit https://elevenlabs.io/voice-lab

If you skip audio, the deck will still work — cards just won't have pronunciation recordings.

**Review gate — publish a new Claude Artifact you can actually listen to.** A text table isn't
enough here — the whole point is hearing the clips. Read the updated `cards.json` (now has an
`audio` filename per card) and the run's `audio/` directory; for each card, base64-encode its mp3
file and embed it as `<audio controls src="data:audio/mpeg;base64,...">` next to English/Target/
Pronunciation, same visual system as the other two review artifacts. Skip the click-to-mark
row-strike interaction here — instead, add a short free-text note per row (or a simple "flag"
toggle) since the real action isn't exclusion, it's "this one sounds wrong, regenerate it": copy
button produces `Please regenerate audio for rows 3, 12.` To act on that: delete that term's cached
clip from `.anki-builder/audio/<voiceId>/<hash>.mp3` AND its copy under `<runDir>/audio/`, then
re-run `anki-builder audio --run <runDir> --voice <voiceId>` — it's resumable and only regenerates
whichever terms are missing from the cache, not the whole batch. For a large deck (many dozens of
cards), embedding every clip can make the artifact file large/slow to publish — if that happens,
say so and offer to split it into a few smaller artifacts rather than silently producing one huge
page.

### Step 5: Deck Build

Once translation (and optionally audio) is complete:

```sh
anki-builder deck --run <runDir> [--name "My Deck"]
```

This:
- Reads `cards.json`
- Assembles a two-template Anki deck (question → answer format)
- Includes audio files if present
- Writes `deck.apkg` to your run directory

The `.apkg` file is a complete, importable Anki deck.

### Step 6: Import & Verify

Open Anki:
1. File → Import → select `deck.apkg` from your run directory
2. Review the imported cards
3. Test playback (audio should play if audio was generated)
4. Start studying!

If something looks wrong (missing translations, bad pronunciation, etc.), you can:
- Edit the source corpus.json / cards.json and re-run from that stage
- Re-run `anki-builder` commands to regenerate later stages
- Stages are resumable — running a stage whose output already exists reuses it

## Command Reference

All commands use `--run <dir>` to specify the run directory and read/write artifacts there.

### Assemble corpus
```sh
anki-builder assemble --run <dir> --template travel-essentials
anki-builder assemble --run <dir> --epub <path> --lang es
```

### Translate
```sh
anki-builder translate --run <dir>
```

### Generate audio
```sh
anki-builder audio --run <dir> --voice 21m00Tcm4TlvDq8ikWAM
```

### Build deck
```sh
anki-builder deck --run <dir> --name "Travel Spanish"
```

## Environment Variables

Set in `.env` or export to your shell:

- `ELEVENLABS_API_KEY` (required for audio): Your ElevenLabs API key

No env var needed for local state — it always lives in `.anki-builder/` inside this repo
(gitignored), nothing to configure.

## State & Artifacts

All artifacts are stored in your run directory (`--run <dir>`):

- `corpus.json` — assembled from template or EPUB
- `cards.json` — translated and enriched corpus
- `audio/` — generated audio files (if audio stage ran)
- `deck.apkg` — final Anki deck, ready to import

Audio is cached in `.anki-builder/audio/<voiceId>/` so reruns don't regenerate the same audio.

## Troubleshooting

**"corpus.json already exists — reusing"**  
The assemble stage found an existing corpus and skipped regeneration. To start fresh:
```sh
rm <runDir>/corpus.json
anki-builder assemble --run <dir> ...
```

**"ELEVENLABS_API_KEY not set"**  
Ensure `.env` is copied from `.env.example` and contains your key, or export it:
```sh
export ELEVENLABS_API_KEY=sk_...
```

**Translation/audio failed**  
Check the error message — it usually names the stage that failed. Re-run that stage after fixing the input (e.g., edit `corpus.json` if assemble failed). Stages are resumable.

**Anki import failed**  
Ensure the `.apkg` file exists and is not corrupted. Check that the run directory path is correct.

## Learn More

- [README.md](../../../README.md) — project overview
- `.env.example` — environment variable reference
- ElevenLabs docs: https://elevenlabs.io/docs
- Anki docs: https://docs.ankiweb.net/
