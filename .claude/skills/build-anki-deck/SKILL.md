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

**Review gate:** I'll show you an audit table of all terms:
- English phrase
- Category
- Candidate translation (if any)
- Image & audio flags (populated in later steps)

**You decide:** does the corpus look right? Can I proceed with translation?

If you want to edit the corpus (add, remove, or fix terms), do it now in `corpus.json` before proceeding — each stage reads from the prior artifact.

### Step 3: Translation via Claude

Once you approve, I'll translate the corpus to your target language using `claude -p` (the local Claude tool):

```sh
anki-builder translate --run <runDir>
```

This:
- Reads `corpus.json`
- Generates translations and pronunciations for each phrase
- Writes `cards.json` (the translated cards, ready for audio/images)

**Review gate:** After translation, I'll show you the audit table again with the translated terms and pronunciations. Verify the quality — any mistakes here affect the final deck.

If you want to edit translations or pronunciations, do it in `cards.json` now before proceeding.

### Step 4: Audio Generation

If you want to generate audio (pronunciation recorded by ElevenLabs TTS):

```sh
anki-builder audio --run <runDir> --voice <voiceId>
```

This:
- Requires `ELEVENLABS_API_KEY` in your environment (or `.env`)
- Reads `cards.json`
- Fetches audio from ElevenLabs for each card
- Caches audio in `~/.anki-builder/audio/` so reruns are fast
- Copies audio files into the run directory
- Writes updated `cards.json` with audio file references

**Voice choice:** I'll help you pick a voice. Available voices vary by language. Popular choices:
- For English: `21m00Tcm4TlvDq8ikWAM` (Bella), `EXAVITQu4vr4xnSDxMaL` (Premom)
- For other languages, visit https://elevenlabs.io/voice-lab

If you skip audio, the deck will still work — cards just won't have pronunciation recordings.

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
- `ANKI_BUILDER_HOME` (optional): Where per-user state (audio cache, run dirs) is stored. Defaults to `~/.anki-builder`

## State & Artifacts

All artifacts are stored in your run directory (`--run <dir>`):

- `corpus.json` — assembled from template or EPUB
- `cards.json` — translated and enriched corpus
- `audio/` — generated audio files (if audio stage ran)
- `deck.apkg` — final Anki deck, ready to import

Audio is cached in `$ANKI_BUILDER_HOME/audio/` so reruns don't regenerate the same audio.

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
