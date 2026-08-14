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
  normative for procedure. `docs/PIPELINE.md` covers how the code is wired.
- **What's planned:** two files, and they ARE the planning loop.
  [`.harness/custom/docs/LIMITATIONS.md`](./.harness/custom/docs/LIMITATIONS.md) is the live one:
  every trade-off, bottleneck and known gap, each with a `**Status:**`, and it is what the work
  keeps being driven by. `.harness/tracking/IDEAS.jsonl` is the zero-ceremony inbox for anything
  not yet thought through. A larger piece of work gets a design doc under `docs/designs/`.

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
- **`.harness/custom/docs/LIMITATIONS.md`** — see golden rule 5. If the change RESOLVES an
  existing entry, update that entry's `**Status:**` in the same commit; a resolved limitation
  left reading as live is the same failure as a missing one.
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

### 5. Every change records its trade-offs & limitations

- When a change introduces or reveals a design **trade-off**, **bottleneck**, or known
  **limitation**, add a row to [`.harness/custom/docs/LIMITATIONS.md`](./.harness/custom/docs/LIMITATIONS.md)
  **in the same commit** — what it is, *why* it was chosen, its **impact**, its `**Status:**`, and
  *when to revisit*. If the row asserts a fact about live data, give it a `**Verified by:**` command
  that re-derives that fact instead of freezing a count in prose. (Record it in the `custom/`
  **overlay**, not the plugin-owned `.harness/docs/LIMITATIONS.md`.)
- That file is the single place to evaluate the design's compromises later without
  re-deriving them from the code. A capped scope, a hardcoded assumption, an "un-handled for
  now" — that's exactly what belongs there. **It is also this project's planning loop**: what
  gets built next comes from reading it, so an entry that is stale, or missing, quietly steers
  the work wrong.

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
the entry in `.harness/custom/docs/LIMITATIONS.md` for the one mechanical concern that survives it
and how that concern is handled without any content comparison.

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
   not in CI, because `/output` is gitignored and CI has no deck data.
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
- Two checks are deliberately NOT in CI, because `/output` is gitignored and CI has no deck data:
  `npm run validate:decks` (every deck's JSON against the schemas) and `npm run preflight` (the
  deterministic pre-review sweep). Run them by hand after touching deck data or the schemas.

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
- **`.harness/custom/docs/LIMITATIONS.md` + `.harness/tracking/IDEAS.jsonl` are the planning loop.**
  Limitations are the live list of what is wrong or deferred and each carries a `**Status:**`; the
  ideas inbox is where an unshaped thought goes (one JSON row: `{id, title, description,
  capturedAt}`). Both live under `.harness/` for the same reason as the record: that is where they
  already were, and moving them would break more references than it fixes.
- Anything big enough to need sequencing gets a design doc in `docs/designs/` and, if it is being
  built by several agents, one branch per workstream.
