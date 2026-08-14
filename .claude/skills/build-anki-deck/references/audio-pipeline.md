# Audio pipeline internals

How audio is generated, processed, cached, reviewed, and safely re-run. The workflow spine
([SKILL.md](../SKILL.md) Step 4) covers the commands and the gate; load this file when you need the
mechanics: the end marker, variant takes, the trim and cleanup chain, the cache, or what a re-run
touches. Implementation detail beyond this lives in [docs/PIPELINE.md](../../../../docs/PIPELINE.md).

## What the `audio` stage does

`anki-builder audio --run <runDir> [--voice <voiceId>]`:

- Requires `ELEVENLABS_API_KEY` in your environment (or `.env`).
- Refuses to run until the lesson's corpus review is signed off (`cards.meta.reviewed`), so TTS
  credits are never spent on unreviewed content. It also refuses while any card would send a raw
  numeral to the TTS voice (a numeral needs a spelled-out `reading`; see
  [card-authoring-rules.md](card-authoring-rules.md)).
- Reads `cards.json`, fetches one default clip per card from ElevenLabs, trims and cleans it, copies
  the files into the run directory's `audio/`, and writes the `audio` references back to `cards.json`.
- Skips excluded cards entirely (no TTS spent, `audio` cleared so no player shows). Un-excluding a
  card and re-running `audio` regenerates its clip.
- Skips any card whose shipping clip the stage does not own; see "Re-running audio is safe" below.

**Model:** `eleven_v3` by default (`TTS_MODEL` in `src/audio/ttsModel.js`, override with
`ANKI_BUILDER_TTS_MODEL`; v3 is markedly more natural than the old `eleven_multilingual_v2` at the
same cost).

**Text normalization:** the spoken text is normalized per language before sending
(`src/audio/ttsText.js`). Japanese strips editorial spaces so ElevenLabs doesn't voice them as
pauses; `target`/`reading` keep their spaces for display, only the audio drops them.

## The Japanese end marker: `。ででで`

ElevenLabs frequently clips the end of an utterance: the last mora gets out but its release is cut
short, so the clip ends abruptly instead of decaying. The fix (`src/audio/ttsMarker.js`) is to append
a throwaway syllable run the model is allowed to truncate: Japanese TTS text gets `。ででで` appended
after the real phrase. Whatever gets clipped is the marker, not the content, and the real phrase
keeps its natural ending. The `。` is part of the MARKER, not of the card's text: it makes the model
treat the marker as a separate little utterance and leave a gap before it, and that gap is what makes
the marker findable and removable by the trim.

The trim then cuts the marker back off before the clip ships. When it cannot find and strip the
marker, the card gets an `audioMarkerStuck` flag, badged **Marker audible** in the audio review, so
you know to re-generate or hand-trim that clip rather than ship audible nonsense.

This marker absorbed what used to be a per-language transform that appended a bare `。` to the
spoken text and offered paired takes with and without it. That machinery is gone: there is no such
take to choose any more, the displayed face and reading never carry a `。`, and the character's one
remaining job is inside the marker. Disable the marker with `ANKI_BUILDER_TTS_END_MARKER=0` (Japanese
is currently the only marked language).

## Trim and noise cleanup

**Trailing-silence trim** (`src/audio/trimSilence.js`): every clip that reaches a card gets its
trailing silence, end "blip", and the end marker cut off. Best-effort, needs an optional system
`ffmpeg` (`brew install ffmpeg`); without it clips keep their trailing silence (one warning, then a
silent no-op). Off with `ANKI_BUILDER_TRIM_AUDIO=0`. It applies to every path a clip can arrive by:
the build stage, the dashboard's Generate, and a Replace upload alike, so an uploaded clip never sits
next to generated ones with silence they had removed. Trimming re-encodes, so a derived take is
always stored as `.mp3` whatever the upload arrived as. Automatic trimming only ever cuts the END of
a clip; leading silence survives it and is handled in the manual trim editor.

**Noise cleanup** (`src/audio/cleanupFilter.js`): ElevenLabs clips carry low-frequency rumble under
the voice, and roughly 94% of that energy sits below 80 Hz where speech has nothing. Cleanup runs as
an ffmpeg filter chain before the trim. Three chains: `standard` (the default: steep low-cut, FFT
denoise, downward expander), `gentle` (least invasive, for a clip the default thins), and
`aggressive` (higher corner and harder denoise, for noise the default doesn't reach; despite the name
it cleans less than `standard` on average and costs more voice). Configure with
`ANKI_BUILDER_AUDIO_CLEANUP` (`off` disables); the audio review's trim modal has a per-card chain
picker for the odd clip where the default disappoints.

## The audio review (dashboard)

Open the lesson's own Review view (`/review/:type/:id/:unit`, or its **Review** link on the home
page). Once the lesson is at the audio stage it renders an inline player per card plus these
controls. A lesson edits on its own; you don't need its siblings finished.

- **Replace**: upload a hand-made clip. It is stored as the card's new original
  (`<cardId>-user-<hash>`), trimmed like any generated clip, and set as the card's `audio`.
- **Generate**: synthesize the card's variant takes FRESH via ElevenLabs and audition them in a
  modal, then **Use this** to pick one. The variants (`src/audio/variants.js`) are the Cartesian
  product of two with/without axes, applied to the spoken text only (the displayed `target`/`reading`
  keeps its punctuation):
  - **Comma**: with vs without a mid-sentence `、` (only for a card containing one, e.g. じゃ、また).
  - **Brackets**: full vs short spoken form for a card with an optional bracketed part
    (`おつかれさま（でした）`). English-only parentheticals like `goodbye (formal)` are a display
    variant, not audio.

  So a card offers 1 take (neither axis applies) up to 4 (comma × brackets). Every click makes fresh
  ElevenLabs calls (the API is non-deterministic, so this is how you re-roll a take that sounds
  wrong); clips are written under distinct `…-gen-<hash>.mp3` names so they never overwrite the
  deck's built audio, and nothing touches `cards.json` until you pick. Each row in the modal also has
  a **Re-roll** button: a fresh roll of that one take alone, one credit, replacing only that row.
- **Generate (kanji)**: Japanese only. Converts the card's kana reading into natural kanji+kana
  orthography (which ElevenLabs voices more naturally than all-kana) and synthesizes takes from THAT
  text; the modal shows the produced kanji so you can sanity-check the reading before picking
  (`src/audio/generateKanjiVariants.js`).
- **Edit (manual trim)**: opens a modal showing the card's ORIGINAL take as a waveform with draggable
  start/end handles; each drag is applied server-side and the cut becomes the clip that ships. The
  original is never changed, so a cut that went too far is always recoverable here. This is also
  where the per-card noise-cleanup chain picker lives.
- **Exclude**: drops a card straight from the audio review, no need to go back to the corpus review
  (which is meant to be one-and-done).

Picking a take writes the card's `audio`. There is no per-stage HTML artifact: the dashboard IS the
audio-review surface, and the currently selected clip is simply the one playing inline on the card.
These edit controls stay available after **Mark done** — a done lesson opens straight into the same
editable review, since done gates what ships rather than what you can touch (see SKILL.md Step 4 for
the gate flow, and for the one thing that does need a script: un-shipping the unit).

## Voice choice

If the target language has a configured default voice (`DEFAULT_VOICES` in
`src/audio/voiceLibrary.js`), `--voice` can be omitted entirely; the CLI uses the default and says
so. Otherwise pick one (available voices vary by language; for English,
`21m00Tcm4TlvDq8ikWAM` (Bella) and `EXAVITQu4vr4xnSDxMaL` (Premom) are popular, and
https://elevenlabs.io/voice-lab lists the rest). Once you've settled on a voice for a language you'll
keep using (e.g. continuing the same book), add it to `DEFAULT_VOICES` so future chapters don't need
`--voice` repeated.

## Cache layout, and when to drop it

Audio is cached in `.anki-builder/audio/<voiceId>/<model>/` (gitignored) so re-runs are fast. The
cache is segmented by model so a model switch never reuses a stale clip, and the end marker is part
of the hashed text, so a clip generated with the marker is never confused with one generated without.

**⚠️ Drop the whole audio cache whenever the audio-generation algorithm changes.** The cache key is
only `(voiceId, model, sha256(spoken text))`: it does NOT encode the processing applied to a clip
(silence-trim, cleanup, normalization, or anything else about HOW the clip is produced). A cache hit
reuses the old bytes and skips the fetch AND all post-processing, so any clip cached before an
algorithm change is served stale forever on reuse, silently. This bit us once: trimming lives on the
fetch/miss path only, so clips cached before trimming worked kept their untrimmed trailing blip on
every reuse, audible as a click at the end (e.g. row 3 「さいふ」). The cache isn't valuable enough to
nurse around this. When you change trimming, cleanup, TTS text normalization, the model wiring, the
marker, or any other core audio step, delete the whole cache and let it rebuild:

```sh
rm -rf .anki-builder/audio    # leave .anki-builder/epubs, the EPUB library, alone
```

Regenerating costs ElevenLabs credits but correctness wins; don't try to surgically re-process cached
clips. Re-running `audio` after the drop refetches every clip through the current pipeline.
Run-directory copies are separate: a lesson already built keeps its clips, and the drop only forces
the next generation to refetch.

## Re-running `audio` is safe

A full re-run of `anki-builder audio` over a run is safe: the stage only ever regenerates clips it
owns. A card whose shipping clip came from a deliberate human choice (a `-gen-`/`-genkanji-` variant
auditioned and picked in the dashboard, a Replace upload, a manual trim) is not the stage's to touch
at all: no fetch, no overwrite (`isStageOwnedCard` in `src/audio/index.js`). Ownership is judged on
the card's stored ORIGINAL (`<hash>.orig.mp3` means the stage made it) plus the absence of a manual
cut, and a card with no shipping clip at all is regenerated whatever stale fields it carries. So
adding a card, editing a `reading`, or re-running after a cache drop never clobbers hand-picked
takes. The deck embeds whatever is in each card's `audio`; that field is the source of truth for its
final take.

One related subtlety the stage handles for you: clip names are content-addressed, so editing a
`reading` after audio has run leaves the card pointing at a stale clip that still exists on disk. The
stage compares the stored clip against the card's CURRENT text rather than only checking that a file
exists, so the edited card gets fresh audio on the next run instead of silently keeping the old
recording.
