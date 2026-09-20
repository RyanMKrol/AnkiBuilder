# CLAUDE.md — working conventions for this repo

This file defines how Claude should behave when making changes in this repository.
Follow these conventions on **every** task unless the user explicitly says otherwise in
the current conversation. They are the coding-conventions rulebook. The autonomous build
harness that used to drive this repo is **retired** — see [The harness is
retired](#the-harness-is-retired) at the end of this file for what that means in practice.

## Project orientation

**AnkiBuilder** is a Node CLI/library for building Anki flashcard decks — it reads input
sources and generates Anki deck files (e.g. `.apkg`). It is a batch tool with no long-lived
process and no visual surface.

- **What it is / what you're building:** see `README.md` and `docs/designs/`. `README.md` is
  the source of truth for **what is currently implemented** — read it first to understand the
  present state.
- **How to build a deck with it** (the operator procedure, and the file most worth reading
  before touching anything user-facing): `.claude/skills/build-anki-deck/SKILL.md`, which is
  normative for procedure. A book that has never been built goes through
  `.claude/skills/onboard-epub/SKILL.md` first. `docs/PIPELINE.md` covers how the code is wired.
- **What's planned:** `.harness/tracking/IDEAS.jsonl` is the zero-ceremony inbox for anything not
  yet thought through, and a larger piece of work gets a design doc under `docs/designs/`. There is
  no limitations log; see golden rule 5 for where a correction goes instead.

## Generations, and the deck data they share

**Which generation is this tree?** v2, and it is the only one. The rewrite landed on 2026-09-09 and
`V2-MIGRATION.md` was deleted as the act that says so, which is why this file no longer defers to it.
If that file ever reappears at the repo root, a migration is in progress and its rules win for the
duration.

**Both generations are git tags, and both are the archive.** `v1` marks the pipeline as it stood on
2026-09-06: 13 single-shot `claude -p` passes plus the operator procedure in
`.claude/skills/build-anki-deck/`, having built Japanese for Busy People Book 1 to chapter 17. `v2`
marks the corpus generation rewritten as scripted phases with every model call pinned. Recover either
without disturbing the working tree:

```sh
git worktree add ../anki-builder-v1 v1
```

**The v1 extraction pass is still in the code and still selectable** (`assemble --extraction v1`), so
comparing a chapter against how it would have been built does not need the worktree. Chapters 0-16
were built that way and are deliberately not rewritten.

**`output/` and `.anki-builder/` belong to no generation.** They are the product, and any rewrite
inherits them rather than replacing them. Two consequences worth knowing before touching either:

- **They are partly tracked, and `.gitignore` is deliberate about which half.** The generated bulk
  (audio, images, `.apkg`, `.bak`, the chapter cache) stays out of git; the hand-reviewed JSON does
  not. 93 files under `output/` (`cards.json`, `corpus.json`, `book.json`, `course.json`,
  `anki-delivered.json`, `.preflight-accepted.json`) and 20 under `.anki-builder/` (the dedup
  corpora, `conventions.md`, `taught-index.json`) are versioned, and git is the only backup they
  have. Read the comments in `.gitignore` before editing it: the exclusion is written as
  `/output/**` followed by a directory re-include precisely because git never descends into an
  excluded directory, so the obvious `/output` entry would silently un-track all 93.
- **A field belongs in BOTH schemas or neither.** `corpus.json` and `cards.json` have separate
  declarations in `src/model/index.js`, and a field one knows and the other does not produces a build
  that gets most of the way and then dies at a write. That happened four times in one day:
  `alternateOf` (written by the reconciler), `baseChapterLabel` (stamped by the extras phase, written
  back by `prepare`), `fillInBlank` (produced by phase 2's miner, silently dropped), and `fromTable`
  (agent provenance, which correctly belongs in neither). Ask which passes WRITE the field, not just
  which read it: `prepare` writes the corpus back after translating, so anything the corpus carries
  has to survive a round trip.
- **Four things are a contract, not an implementation detail**, because they are already baked into
  a live collection: the `cards.json` / `corpus.json` schemas, the audio filename convention (which
  addresses roughly 480 MB of paid clips, including the 14 hand-trimmed originals `.gitignore` lists
  one by one), the deck naming in `unitDeckSegments` (`src/deck/deckPath.js`), and the card id to
  Anki note GUID mapping. Changing any of them is a migration of a deck someone studies daily, never
  a refactor.

## Golden rules

### 1. Every change happens on a branch

- Never commit directly to `main`. Always `git pull` (or `git fetch`) first, then create a
  fresh branch off the latest `main` for **each atomic task**. Branches are what keep the
  CI gate and clean rollback possible.
- Branch naming: `<type>/<short-slug>` (e.g. `fix/reconnect`, `feat/preflight-spacing`).
- Keep each branch scoped to one logical unit of work; don't bundle unrelated changes.

### 2. Merge it yourself — no pull requests

- This project **doesn't use pull requests**. When the work is complete and **green**,
  integrate the branch into `main` and push:
  ```sh
  git checkout main && git pull          # sync
  git merge --no-ff <branch>             # integrate the task
  git push                               # publish main
  git branch -d <branch>                 # clean up (also delete remote if pushed)
  ```
- Merge only when `npm run ci` is green and only when the work was asked for — don't merge
  speculative changes.

### 3. Every change updates the documentation

Treat docs as part of "done," not an afterthought. Keep docs in lockstep with the code **in
the same commit** — never as a follow-up. A task is **done when its branch is integrated into
`main`** (code + docs both updated). On every change:

- **`README.md`** — update the implementation-status section in the same commit, so it always
  reflects what the code does.
- **`.claude/skills/build-anki-deck/`** — if the change alters what an operator does or sees,
  the skill is where that lives, and it is normative for procedure. A change that makes SKILL.md
  wrong is not finished.
- **`docs/PIPELINE.md`** — if the change alters how the stages are wired.
- **the place the rule is enforced** — see golden rule 5. A prompt, a check, `SKILL.md`, or a
  comment at the code site, chosen by who has to obey it.
- **design docs** (`docs/designs/`) — only if the change alters the design or an architectural
  decision. Day-to-day implementation usually doesn't touch them.
- If a change introduces a convention or decision worth remembering, note it here in
  `CLAUDE.md`.

### 4. One atomic task at a time

- Keep each commit scoped to a single logical unit of work.
- If a task reveals additional needed work, prefer finishing the current task and committing
  the rest separately over expanding scope mid-task.

### 4a. Commit + push as you go — uncommitted work is NOT durable here (non-negotiable)

Work here often runs several agents at once, each in its own worktree, and any of them can be
stopped, restarted or discarded. A worktree that is thrown away takes its uncommitted changes with
it, and nothing anywhere else has a copy. **Treat "uncommitted" as "not durable."** When a discrete
unit of work is done — a doc sweep, a new script with its tests, a recovery — **commit and push it
immediately**, don't leave it sitting in the tree across a session.

### 5. Fix it where it is enforced, don't file it

**There is no limitations log.** There was one, it reached 199 entries and 4,265 lines, and it was
deleted on 2026-09-20 because filing a problem had become a substitute for fixing one. Git holds it
if you ever need the history.

When you find a limitation, put the correction where the thing is actually decided:

- **A rule an agent has to follow** goes in `docs/card-rules-shared.md` if every card-writing pass
  needs it, or in that one pass's prompt if only it does. A rule written in one prompt and needed by
  four is the failure mode this project keeps hitting: it happened with the paradigm-cell rule and
  again with proper names, and both times the rule existed and simply did not travel.
- **A rule a human has to follow** goes in `.claude/skills/build-anki-deck/SKILL.md`, which is
  normative for operator procedure.
- **Something a check could catch** becomes a check: a preflight tier, a test, or a script in
  `scripts/`. A rule in prose is a hope; a check is a guarantee.
- **A constraint the code must respect** goes in a comment at the site that respects it, not in a
  document somewhere else. A comment two directories away from the code it explains is a comment
  nobody reads at the moment it matters.
- **A settled choice nobody should re-litigate** goes in
  [`DECISIONS.md`](./.harness/custom/docs/DECISIONS.md), which is the one file that survived, because
  its entries close a question rather than parking one.

If a thing genuinely cannot be fixed now, say so in the conversation and let the owner decide. Do not
write it down somewhere and call that addressed.

### 6. Tests never touch production state

Every **test** run must execute against a **scratch / throwaway** resource —
a temp database, a fake or sandboxed endpoint, a tmp working dir — **never** the project's real
database, live services, or real data/output files. A test that mutates production state can
corrupt the running product, and the usual culprit is a stray *direct* test invocation
(`pytest path/to/x`, `node --test foo`) run outside the normal test env.
**Build the guard into the code, not into discipline:** detect a test context from the environment
and **redirect to a scratch resource** (e.g. an `isTestEnv()` / `resolveXxxPath()` that refuses the
production default under tests). Here "production state" is concrete and irreplaceable: `output/`
(hand-reviewed decks, some already delivered to a collection the user studies daily) and
`.anki-builder/` (the dedup library and thousands of paid TTS clips). A test that writes into either
has already cost something. Tests use a tmpdir fixture; no test ever contacts AnkiConnect (port
8765), ElevenLabs, or spawns `claude`.

### 7. Collections are isolated

A **collection** is one deck's worth of source material: one book under `output/epubs/<slug>/`, one
course under `output/courses/<slug>/`, one bundled template under `output/templates/<name>/<lang>/`.
Two collections are two separate products. Process them in **complete isolation**.

Nothing may overlap them, compare them, cue one against the other, dedup across them, or report one
in reference to the other. No check, script, prompt, pass or doc may take two collections' cards and
look at them together. If a question can only be answered by reading a second collection's content,
it is the wrong question.

**Within** a single collection, cross-referencing is unchanged and is the point: a book's lessons and
its `-extras` units are one product being made coherent with itself, so the backward dedup library,
the cross-lesson note pass, the duplicate check and the collision audit all stay exactly as they are.
The boundary is the collection, not the lesson.

This was an owner ruling on 2026-08-14, after three cross-collection checks had already been written
and merged. They were removed. See the addendum in `docs/designs/skill-review-2026-08-plan.md` and
`DECISIONS.md` for the one mechanical concern that survives it and how that concern is handled
without any content comparison.

## Standard workflow for a change

1. `git checkout main && git pull` — **always** sync `main` first, so the new branch is based
   on the latest work and never a stale local `main`.
2. Create a fresh branch off `main`.
3. Read `README.md` (current state), `SKILL.md` if the change is anywhere near the operator
   procedure, and the LIMITATIONS entries the change touches.
4. Make the change, keeping it atomic.
5. Update docs in the same commit (golden rule 3), including any LIMITATIONS entry the change
   creates or resolves.
6. **Run `npm run ci`.** Format, lint, test and build all pass, plus whatever empirical check the
   change calls for (`npm run validate:decks`, `npm run preflight`) — those two are deliberately
   not in CI, because CI has no deck data: the audio and caches those checks read are gitignored,
   and a fresh clone has only the tracked JSON.
7. Commit on the branch, push, then merge per golden rule 2 once green.

## Before you start — check the ground is real

- **Verify what you are building on actually exists.** Don't trust a doc, a plan or a status line:
  confirm the functions, files and behaviour you depend on are really there. This whole project's
  signature failure is that an absent thing reads exactly like a working one — that applies to the
  prose describing it too. If something you need is half-done, say so rather than working around it.
- **Anything spending real money or touching production is a human step.** Delivering to the live
  Anki collection, spending TTS credits at scale, deleting anything under `output/` or
  `.anki-builder/`: prepare everything around it, then hand off. Never contact AnkiConnect
  (port 8765) or ElevenLabs from a test or a check.

## Working alongside other agents

Larger pieces of work run as several agents in parallel, one per workstream, each in its own
worktree on its own branch. `main` moves under you. If your fast-forward is rejected, or
`git merge origin/main` reports conflicts — **resolve them, don't abandon the work:**

1. **Resolve on your own branch** (`git fetch origin && git merge origin/main`), preserving
   **both sides' intent** — union doc sections and manifest lines, and *integrate* (never discard)
   code changes. Read the other commit's message and its diff to understand what it was doing.
2. **Re-run `npm run ci`** on the merged result. A resolution that builds but fails a test — yours
   *or* theirs — is not done. For lockfile conflicts, resolve the manifest first, then regenerate a
   consistent lock.
3. **Re-check your own change still holds** on the merged code before you push.
4. **Be discoverable.** A clear commit message saying what changed and why, so the next agent
   reading `git log` can tell.

## Tooling notes

- **Stack: Node.** The Definition-of-Done commands (authoritative copy lives in
  `.github/workflows/ci.yml`) are:
  - install — `npm ci`
  - format — `npm run format:check`
  - lint — `npm run lint`
  - test — `npm test`
  - build — `npm run build`
- Mirror any change to these verbatim in `.github/workflows/ci.yml`. CI is the authoritative gate.
- **Never push anything that would fail CI — run the full suite locally first, every time.** The one
  command is **`npm run ci`** (= `format:check && lint && test && build`, the exact CI Definition of
  Done). CI going red on a mechanical check (formatting, lint) is a process failure that should never
  happen: `npm run format` auto-fixes style, and `npm run ci` catches lint/test/build before they reach
  the remote.
- **This is enforced by a `pre-push` git hook** (`.githooks/pre-push`, wired via `core.hooksPath`, which
  the `prepare` npm script sets on `npm install`). The hook runs `npm run ci` and **blocks the push** if
  anything fails — so "push every commit" stays safe. Do **not** bypass it with `git push --no-verify`
  except in a genuine, explained emergency. If you ever add a new check to CI, add it to the `ci` script
  too so the hook stays a faithful mirror.
- Two checks are deliberately NOT in CI, because CI has no deck data to check: `npm run
  validate:decks` (every deck's JSON against the schemas) and `npm run preflight` (the deterministic
  pre-review sweep). The hand-reviewed JSON *is* tracked (see "Generations" above), but the audio,
  images and chapter cache these checks also read are gitignored, so a fresh clone cannot run them
  meaningfully. Run them by hand after touching deck data or the schemas.

## The harness is retired

This repo was built by an autonomous implementation harness (`.harness/`, a single sequential
`loop.sh` over a `TASKS.json` backlog). **It is retired.** Its ledger stopped on 2026-07-13; the 535
commits since then were all made by hand or by ordinary agent sessions, and its last remaining task
was never run. Keeping it described as the way work happens here made this file describe a process
nobody follows.

What that means:

- **Do not run `.harness/scripts/loop.sh` or `supervise.sh`**, and do not author new `TASKS.json`
  tasks. `TASKS.json`, `tasks/` and `worklog/` are a historical record of how the project was built,
  kept because they are exactly that; nothing reads them.
- **`.harness/tracking/IDEAS.jsonl` is the inbox** for an unshaped thought (one JSON row:
  `{id, title, description, capturedAt}`). It lives under `.harness/` for the same reason as the
  record: that is where it already was. There is no limitations log beside it any more; golden
  rule 5 says where a correction goes.
- Anything big enough to need sequencing gets a design doc in `docs/designs/` and, if it is being
  built by several agents, one branch per workstream.
