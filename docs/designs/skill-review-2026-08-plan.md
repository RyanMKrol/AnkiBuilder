# AnkiBuilder end-to-end improvement plan

## Context

You asked for a full end-to-end review of the build-anki-deck skill, with EPUB ingestion as the priority, run by multiple agents with different perspectives who debate until they align on one plan. Nine evaluator perspectives (QA, linguist, tech lead, code expert, generalist, learner, prompt engineer, adversarial-EPUB, plus governance roles) produced 101 findings, filed 42 objections against each other in a discussion round, and an arbiter synthesized the plan under an agreed charter (your red lines are constitutional; learner outcome beats engineering elegance; evidence beats opinion; reversible changes get benefit of the doubt). The draft survived four red-team rounds; ten places where the plan itself would have caused damage were caught and fixed. Final verdict: approve.

Two empirical probes grounded the review: live parser runs against both the known book and a hostile fiction EPUB (which degraded silently on every axis: 0/35 TOC entries classified as lessons, silently swallowed spine files, inverted ranges), and a hand-executed extraction-fidelity diff against a human-reviewed chapter (which found the one proven content loss, see WS3).

The one-sentence diagnosis the fleet converged on: **the engine is disciplined and the pedagogy is genuinely good, but every load-bearing invariant that spans a boundary (between collections, between disk and live Anki, between a cached LLM artifact and a newer prompt, between prose rules and code) is enforced by nothing, and an absent check reads exactly like a passing one.** The project's own signature failure mode, silent degradation, applies to its safety net too.

Full converged plan detail (490KB JSON: 59 items with complete mechanics, 24 rulings with dissents, per-finding evidence) lives at:
`/private/tmp/claude-501/-Users-ryankrol-Development-anki-builder/96f69844-5f0f-46c8-9b89-69cf2f9781d0/tasks/w58dw15xn.output` (key: `result.plan`).
**First implementation step: copy that file into the repo** (e.g. `docs/designs/skill-review-2026-08.json`) before /private/tmp expires.

## Your decisions, already incorporated

1. **Snapshots: git-track** the irreplaceable JSON (not tarballs).
2. **Template path is alive** and should be brought up to parity, not deleted.
3. **Second Anki profile: yes** (probe ceremony: reset profile + hand-create sentinel deck per session).
4. **No new card directions** for now (no listening or picture cards; revisit later).
5. **Reading stays TTS-only, never rendered.** No furigana field. Kanji targets are studied bare; audio carries the reading. Extraction must still populate the field for kanji targets as TTS input.
   - **Follow-on decision: rename `reading` → `ttsText`** in the pipeline JSON (schema, prompts, passes, dashboard), so the field's name states its contract and future agents cannot mistake it for a display field. The Anki note-type field stays named "Reading" (inert, no template references it; the deliverer maps `ttsText` → Reading in one line) so the live collection is never touched. See WS3 item 0.
6. **Taxonomy: add the two new categories; worked examples take the category of the form they demonstrate.**
7. **Deck names: migrate the existing book once via the previewed `--refile`** after probes prove it safe.
8. **Suspended-card clutter is acceptable** as the mechanism for direction suppression and orphan handling.

## Workstreams

Order matters: WS0 blocks everything destructive; WS1 items 1-2 block the ~15 new checks; WS8's eval fixture lands before WS3's prompt rewrites; WS1 item 6 (model-diff guard) gates every WS4 note-type change; WS1 item 10 (probes) gates WS6 `--refile` and WS4 item 6's opt-in half.

### WS0 - Stop the bleeding: protect irreplaceable state (do first) [5 items]

`/output` (422MB, 29 hand-reviewed units) and `/.anki-builder` (dedup library) are gitignored AND untracked with no backup anywhere; ~40 items in this plan mutate inside them.

1. **[S] Git-track the irreplaceable JSON.** Globs: `output/**/{cards,corpus,book,course,anki-delivered}.json`, `.anki-builder/epubs/*/{corpora/,conventions.md,taught-index.json}`, plus `.preflight-accepted.json` and the seven flagged audio clips with their `.orig.mp3` siblings. Mechanics are load-bearing: git does not descend into an excluded directory, so `/output` must become `/output/**` plus a `!/output/**/` directory re-include placed before the file re-includes (same for `.anki-builder`); verify with `git check-ignore -v` on a real cards.json. Note honestly: this protects JSON only; audio recovery rests on the `.orig.mp3` siblings.
2. **[S] Make `libraryHome()` refuse the real library under a test runner.** Redirect to a suite-scoped tmpdir, gated on `NODE_TEST_CONTEXT` only (not `isTestEnv()`, which also fires on `NODE_ENV=test` and would silently redirect a real run). Guard at `libraryHome()` itself (`src/model/index.js:365`), since all writers resolve through it. Update the one test asserting the un-redirected path. Root cause: `npm test` currently writes into the durable library (five reviewers independently found `.anki-builder/epubs/h1/` and four stub files in `.anki-builder/audio/v1/`).
3. **[S] Suite-wide durable-write guard, then delete the two strays.** Wrapper around `node --test`: manifest of `.anki-builder/`, `output/`, `anki-backups/` before, diff after, fail naming any changed path. Add `assertExternalCallAllowed` to `fetchElevenLabsTts` (bills per character, currently unguarded). Then delete exactly two literal paths: `.anki-builder/epubs/h1/` and the voice-id directory literally named `.anki-builder/audio/v1/`. The literalness is load-bearing: `v1` reads like a cache-version namespace, and a glob misreading would rm 3,610 paid clips.
4. **[M] Route every `scripts/` `--apply` write through atomic write + backup + validate.** `extras-duplicate-check.mjs` and `extras-order.mjs` use bare `writeFileSync` against reviewed units. Stamp backups `<file>.pre-<reason>-<stamp>.bak` so re-running a tool cannot clobber its own restore point; add `scripts/prune-baks.mjs`.
5. **[S] Add `excludedBy`/`excludedReason` provenance to the card schema.** 95 cards are excluded today and a script's `--apply` exclusion is byte-identical to a human decision. Stamp from every `--apply` writer, render in dashboard, report per-unit counts in preflight.

### WS1 - Verification substrate: make the deterministic gate a gate [10 items]

Preflight currently prints two permanently non-zero report lines followed by "preflight clean"; adding 15 more checks without structure converts the one deterministic gate into wallpaper.

1. **[L] Introduce `src/audit/` with one unit loader and unit/collection/workspace scopes.** Single `listUnitDirs` knowing all three unit shapes (chapter|lesson-N, -extras, templates/<name>/<lang>/), replacing four independently re-typed regexes. Check registry with declared scope per check; validate-decks folds in as `--schema-only`. Pin the undocumented invariant that `chapterNumber` = the lesson's first spine index (join key for four subsystems). Per your decision, the template shape is in scope from the start, and **template-path parity is added to this workstream**: preflight enumerates `output/templates/`, and the template path's enrichment/readiness exemptions become explicit, reported decisions instead of silent gaps.
2. **[M] FAIL / ACK / INFO tiers with a per-collection acknowledgement file.** ACK counts report unreviewed instances against `.preflight-accepted.json` (written only by explicit `preflight --accept`); coverage header so "clean" can never mean "didn't look". Standing rule: a check promoted to FAIL ships in the same commit as the fix or ACK for its live instances.
3. **[S] Land the silent-corruption guards.** (a) Refuse the dedup-library save for `-extras` run dirs (chapter-13 and chapter-13-extras share chapterNumber 33 today; one copied field would overwrite the base chapter's dedup entry). (b) Assert every reviewed EPUB unit has its `corpora/<n>.json` (and report the reverse: would have caught the h1 leak on day one). (c) Assert no `〜` in shipped targets (one live survivor: fix or ACK in the same commit).
4. **[M] Workspace-scope checks: cross-collection card ids, cross-deck collisions, stray .apkg.** Both delivered collections ship bare guids and share 10 card ids (nine byte-identical, one real conflict: スカーフ vs マフラー). Anki interleaves all decks studied per day, so collision doctrine must widen to collection scope. Delete the confirmed foreign 11MB JBP .apkg inside `output/courses/nihongo-101-course-n5/` in the same commit its check lands.
5. **[S] Package-freshness check.** FAIL when a done unit's cards.json is newer than the collection's .apkg. Confirmed live right now (course .apkg is a day older than two units); land in the same commit as a rebuild. Fix the two false comments claiming edits to done lessons auto-rebuild (`rebuildGroupQuiet` has exactly one caller: Mark done).
6. **[S] Model-diff guard for delivery (hard prerequisite for WS4 item 5).** The note type is keyed on language alone, so delivering any ja deck rewrites templates/CSS for BOTH collections and forces a manual one-way AnkiWeb sync. `--dry` prints a unified diff of live qfmt/afmt/CSS vs spec plus every deck using the model; require explicit `--allow-model-change` when templates/CSS change.
7. **[S] Make extras-duplicate-check report-only on the documented path.** Reproduced read-only: `--apply` would exclude all five genuine particle senses of に in favor of the number 2. `references/extras-pass.md` currently advertises `--apply` as a normal step while `preflight.mjs` argues in writing the same judgment must never be auto-applied.
8. **[M] First tests for `scripts/` (13 files, 1,653 LOC, zero tests) and the dashboard rebuild-failure signal.** tmpdir fixture root with one deliberately broken unit of each kind; rule: mutating scripts keep logic in `src/` behind unit tests. Two cheap tests for `clientScripts.js` (the only surface rendering the rebuild-FAILED string both human gates depend on).
9. **[M] Headless .apkg import verifier + `npm run check` as a manual gate.** `scripts/verify-apkg-import.mjs` imports a built .apkg into a throwaway collection via the pinned `anki` Python package (no running Anki, nothing on :8765). Settles two questions nobody could answer: dconf id-1 collision behavior, and guid-match-vs-duplicate on re-import. Explicitly NOT wired into pre-push (the hook must not couple `git push` to unversioned deck state); `npm run check` = ci + validate:decks + preflight, documented where SKILL.md already puts preflight. Per your decision, the first worked template deck doubles as this verifier's fixture.
10. **[M] Live-AnkiConnect behaviour probes against a throwaway profile, never yours.** Answers the four deferred delivery questions (template-add regeneration, changeDeck on filtered cards, suspend on filtered cards, unsuspend-on-housekeeping). Fail-closed interlock, all four required at startup AND re-asserted before each write-bearing probe: (a) no `AnkiBuilder *` in `modelNames()` (rename-proof); (b) `findNotes("tag:abid:*")` returns zero; (c) sentinel deck `ANKIBUILDER-PROBE-ONLY` present AND card count (via `findCards`, not note count) under 200; (d) no deck matches a delivered marker's `ankiParent`. Profile named `ANKIBUILDER-PROBE`; reset (delete + recreate) is a documented human step, never scripted; the script creates its test model only after the interlock passes. AnkiConnect is per-installation (live in every profile), which is why the interlock, not the setup, is the guard. Mirrored verbatim into `references/deliver.md`.

### WS2 - EPUB ingestion robustness (your stated priority) [8 items]

Thesis: make the second book's failures loud at `--list-lessons` time, before any paid pass, without touching the agentic core. On the probed hostile book nothing throws and everything degrades silently.

1. **[M] `scripts/epub-probe.mjs` + fold its shape report into `--list-lessons`.** Nav source, per-entry spine ranges vs files actually named, unreachable spine files, duplicate-href collapses, classifyLesson as annotation, deck segments per label, text-length vs image-count per file, image-collision count. Answers "will this book work" in five seconds for zero LLM spend. (Even the proven book: entry [56] silently swallows spine 57; file 11 is 94 chars of text with 7 images.)
2. **[M] Make the silent parser drops loud.** Tolerate attributes/nested markup in NCX `navLabel` (the live path for EPUB2); strip comments/CDATA before every regex scan (a commented-out nav anchor currently becomes a phantom lesson); detect non-monotonic nav ranges (a probed 5-2 range silently degrades to single-file extraction AND poisons forward-flags); warn when the nav block has more `<a>` than parsed entries.
3. **[M] Image-extraction detectors.** (a) Byte-compare on write for the confirmed image-filename collision (all chapters share one `chapters/` dir; standard Sigil/InDesign layouts collide, and a swapped image is swapped card content because the extraction model Reads these files). Log loudly, count in the shape report. (b) Zip-slip containment (`../` in archive srcs is currently unfiltered and can escape into repo source). (c) Flag SVG-wrapper images.
4. **[L] Mirror the archive layout under `chapters/` so image collisions become impossible by construction.** Strictly after item 7's fixtures. Explicitly forbidden: any flattening/hashing scheme that changes an image's path relative to its chapter file without rewriting srcs (invisible failure). Forces the item-5 cache-version bump.
5. **[M] Version the EPUB cache + guarded clear command.** `CACHE_VERSION` in the chapter-cache path; `anki-builder epub cache --clear <hash> [--chapters|--conventions|--taught-index]` that refuses to touch `corpora/`. Today every parser/prompt fix is inert for cached books, and the only recourse is `rm -rf` directly beside the dedup registry.
6. **[S] Decode HTML entities properly, new-books-only.** Numeric + common named entities; insert a space when stripping inline elements (`<span>Lesson</span><span>5</span>` currently becomes "Lesson5", defeating the grouping regex). Gated on a book-marker flag: existing book's deck names frozen until the one-time `--refile` migration you approved (after WS6 item 2 + probes).
7. **[S] Real DRM detection + wider nav discovery.** Parse `META-INF/encryption.xml`; throw "DRM-protected" only when a spine document is encrypted (font obfuscation must not false-positive). Adobe ADEPT books currently parse "successfully" into ciphertext and would hand 40+ garbage files to a paid whole-book pass. Add a last-resort prefix-agnostic nav sweep after the current tiers.
8. **[M] Hostile-EPUB fixture suite.** One fixture per silent shape (ruby, entities, comments/CDATA, NCX attributes, duplicate hrefs, non-monotonic nav, path-escaping srcs, colliding image names, non-UTF-8, SVG wrappers). Current adversarial coverage is inversely correlated with risk: only the two loud paths (ZIP64, zip encryption) are tested. Prerequisite for item 4.

### WS3 - Extraction & prompt quality [6 items]

Carries the review's only demonstrated card loss. WS8 item 2's extraction eval fixture lands first so these edits are observed, not hoped.

0. **[S] Rename `reading` → `ttsText` in the pipeline JSON (your decision).** One consistent contract, stated in the schema and every prompt: "the text TTS speaks instead of the target when the written target would be misread; never rendered." Rename across CORPUS_SCHEMA/CARDS_SCHEMA, the extraction/translate/number-reading prompts, the TTS pipeline, dashboard, and tests; migration script over all cards.json/corpus.json and the dedup-library corpora (136 populated cards). `additionalProperties: false` makes the migration self-verifying: any unmigrated file fails `validate:decks` loudly. The Anki note-type field keeps the name "Reading" (inert; deliverer maps `ttsText` → Reading), so the live collection is untouched. Sequenced after WS0 (it mutates reviewed units) and before every other WS3 item (so prompts are written against the new name once).

1. **[M] Fix the conventions-vs-extraction precedence conflict + link cached artifacts to prompt versions.** The proven loss: `conventions.md` (14 Jul) says skip chapter 32's あります/います paradigm image as exercise material; the extraction prompt (9 Aug) uses that exact shape as its worked example of "extract in full"; chapter-12 ships zero of those eight forms. Conventions become authoritative about markup only, never about what to extract; write `<artifact>.meta.json` (prompt hash, model, timestamp) beside cached conventions/taught-index and WARN on drift (never auto-regenerate: paid pass, judgment call).
2. **[S] Resolve the dialogue-ban vs worked-example contradiction.** The two rules are mutually unsatisfiable and the corpus shows the model breaking the ban to satisfy Step 2. Narrow the ban to "not wholesale as a script" with a stated exception for the only in-chapter demonstration of a required function word, marked with a reviewNote.
3. **[M] Write the two coverage scripts SKILL.md already specifies as scripts.** `vocab-coverage.mjs` (voca-table diff with prefix normalization) and `paradigm-grid.mjs` (agent authors the grid; the matching implements the predicate-position rules that live only as prose). The doc already ruled these are mechanism, not judgment; neither exists, so a throwaway variant is re-derived every chapter.
4. **[M] Give extraction a coverage back-channel + missing content-class rules.** Envelope contract `{items, coverage:{imagesOpened, imagesSkippedAsDecorative, concerns}}` (parser accepts both shapes), diffed against the referenced-image set; today a chapter the model could not read is indistinguishable from an empty one. Add rules: discontinuous patterns (X…〜Y), numbered picture-caption lists, and ruby: `<rt>` content is the publisher's authoritative reading, copied into `reading` (TTS-only per your decision), never into `target`.
5. **[M] Move the code-embedded prompts (romanization, translation) into `docs/` templates.** They touch every card, are the only prompts requiring a code change to edit, and their hand-maintained doc has already drifted from the shipped prompt. Lands before WS4's Hepburn injection and WS5's language fragments (all three edit the same file).
6. **[M] Show the authoring model the rendered card faces + fix taxonomy drift.** `{{CARD_FACES}}` block generated from the real templates so "the scene must not leak the answer" becomes operational; fix the concrete prompt drift (field count, dangling cross-references, stale category names); add the CATEGORIES enum to the cards schema; state the form-based category rule for worked examples (your decision).

### WS4 - Card & learner quality [8 items]

Every note-type/CSS change gates on WS1 item 6's model-diff guard.

1. **[M] Pin one Hepburn spec and lint it.** `pronunciation` renders on the back of both directions of 2,250 cards and drifts per batch (trailing periods 100% in some units, 0% in others; -san hyphenated 32/32 in one unit, spaced 40/40 in the next). Single style constant injected into all four prompts that romanize; WARN-level preflight lint.
2. **[S] Audit the 1,847 inline romanizations against the deck's own pronunciation field.** Ground truth in the same file; at least 36 disagreements already measurable.
3. **[M] Render the real card face for the reviewer at Gate 1.** Per-card flip toggle rendering real qfmt/afmt/CSS for both directions. The three most valuable authoring rules are claims about a rendered front no surface ever shows anyone. Read-only, not gated on the model guard. Highest card-quality return per line in the repo.
4. **[S] Answerable-alone audit + FIB length ceiling.** WARN-level: pronoun-stand-in English with no scene (27 live hits); Production faces ≥60 chars (31 live); near-sibling check narrowed to frames differing solely in a proper noun or digit.
5. **[S] Fix the card face (gated on WS1 item 6).** Prompt string at answer sizing (question text is currently 20px while the same string as an answer is 26px bold); contrast fixes to clear WCAG AA; drop the category chip from Recognition fronts only (it is an uncontrolled answer cue on 2,150 fronts, stronger than any scene the collision doctrine would permit); distinct scene vs hint treatment. Per your decision, Reading is NOT rendered (struck from the original item).
6. **[L] Per-card direction control via suspend-at-delivery.** Two mechanisms struck as actively harmful (empty-front template: Empty Cards deletes the card with its history; build-side omission: inert on the AnkiConnect path, self-reversing on .apkg). Mechanism: flag in card schema, .apkg keeps both rows, deliverer suspends the unwanted ordinal. Unconditional only for notes created by this deliver; opt-in + `--dry`-previewed for already-delivered notes; a human unsuspend is respected forever (tag per-ordinal, `dir-suspended::<ord>`, state read from `cardsInfo`); gated on WS1 item 10's suspend/odid probe. Stated consequence: the .apkg deliberately no longer reproduces the delivered deck card-for-card.
7. **[M] Expand the taxonomy (your decision: yes, form-based) + notes truth-check at Gate 1.** Add "Descriptions & Qualities", "Everyday Objects" (absorbs most of the 222-card Other bucket). Deterministic helper lists every note asserting a decomposition; verdict stays human (a shipped note currently teaches a false morphological analysis that survived every structural check).
8. **[S] Hand-cue the scarf pair and the 10 uncued cross-deck ambiguities now.** Two-line cards.json edits reaching the collection on next deliver; behind WS0's snapshot.

### WS5 - Audio [5 items]

1. **[M] `audioTextHash` for every take, backfilled from `audioOriginal` filenames (99% derivable), badge-only first.** Closes the staleness hole exempting every hand-touched clip (~200 cards) from the text-changed check forever. Never bulk-stamped from current text (that would certify existing drift); ship as a badge, measure the live count, then decide promotion; add a per-card human "keep this clip for current text" accept action.
2. **[S] Triage the 7 marker-audible clips shipping in the live collection now; move the count to the ACK tier.** Recovery honestly stated: rests on `.orig.mp3` siblings (confirmed present), which WS0 pulls into the snapshot.
3. **[M] Kanji-orthography TTS as opt-in default for NEW units, behind a blind A/B on the homophone class.** Flipping it globally would re-hash ~1,700 paid clips and produce a silently mixed-orthography deck (hand-touched clips are exempt from regeneration).
4. **[M] Triage the ar/hi/he romanization adapters + de-Japanify the correction prompt.** Empirically unusable output today (كتاب→ktab) while the prompt anchors on two Japanese exemplars. Record that only ja/zh/ko are library-proven.
5. **[S] Document end-marker ja-only scope; trial か-question rising prosody on new cards only** (never a bulk regeneration of 328 delivered question cards).

### WS6 - Delivery integrity [5 items]

1. **[M] Template-add path for the deliverer, or fail loudly, routed through the model-diff guard.** Today `updateModelTemplates` is called with a name AnkiConnect will not create: a no-op reporting success on a live-collection write. With your "no new directions" decision the fail-loudly half is the near-term need; the guarded add path stays specified for later.
2. **[M] Opt-in previewed `--refile` + rename guard.** The largest unbounded-damage path: `ankiParent` is a human-editable title; a rename makes the bootstrap query return nothing and re-inserts the whole book as fresh notes with no scheduling, while the backup records a false success (AnkiConnect returns `result:false` without error for a missing deck). Abort on marker-present-but-zero-notes; treat falsy `exportPackage` as failure; add-count ceiling; `--refile` skips filtered-deck cards (probe-gated). Your decision: run the migration once, previewed, after it's proven.
3. **[M] Split the bootstrap index families; make the fail-closed baseline real.** Keep the book-wide query as the sole source of `byAbid` (the durable key must never be narrowed: a fallthrough re-adds notes with fresh scheduling); unit-scope only the first-run fingerprint indexes (closes the cross-bind on 17 confirmed repeated targets). Add `deliveredCardIds` to the marker (it does not exist yet; both live markers hold only three keys), make that write fail-loud (currently an empty catch), explicit bootstrap rule (gate arms from the second deliver), abort at >10% unresolved and always at 100%. Opt-in `--suspend-orphans` (95 excluded cards today; a post-delivery exclusion leaves a live orphan the learner drills forever).
4. **[S] De-collide the shipped dconf preset (id 1, "Default") + document sibling burying.** The line that reaches your already-imported decks is the doc line: enable bury-siblings on the preset the decks use (Recognition and Production of the same note currently land back-to-back, so the second is answered from working memory).
5. **[S] Settle guid namespacing + the .apkg import runbook + the second-profile runbook.** Both collections ship bare guids; a bare-guid deck must never be .apkg-imported into a collection holding another. The import verifier (WS1 item 9) decides what re-import actually does.

### WS7 - Skill doc & process hygiene [7 items]

1. **[M] SKILL.md truth sweep, one commit.** Critical bug: the documented recovery for a mis-clicked Mark done prescribes a Reopen button that exists nowhere in `src/` (an agent following the doc will improvise a hand edit of live state). Also: `deck.apkg` → `<slug>.apkg` (nine places), the false "pipeline never sees images" claim, the Step-3b timing contradiction, the undocumented fifth prepare pass, present ALL nav entries with classification as annotation never filter (0/35 qualify on the probed book: the most likely first-five-minutes failure of book #2).
2. **[M] Replace the review-watcher prose with `scripts/await-review.mjs`** (+ `scripts/undone-unit.mjs`: back up, clear meta.done, rebuild). ~50 lines of shell encoding four incident-learned rules, currently retyped ~60 times per book; zero judgment, it observes a flag a human sets.
3. **[S] Docs-integrity test + declared doc precedence.** Every script path mentioned in docs exists; every script is referenced somewhere; SKILL.md normative for procedure, PIPELINE.md for wiring. Fix the stale Haiku claims.
4. **[S] Replace the per-chapter image sweep with the artifacts that already exist** (727 images already extracted and cached; the sweep's stated justification is false). Judgment (load-bearing vs decorative) stays agentic.
5. **[M] `finalize-extras` and `check-done` as commands.** The extras tail is a seven-command hand-sequenced procedure; two steps have already been forgotten in production. All authoring stays agentic.
6. **[S] LIMITATIONS.md status field; retire the dead harness loop.** State in CLAUDE.md that LIMITATIONS.md + IDEAS.jsonl are the planning loop; transplant T011's content into a when-to-revisit entry; reconcile the six already-shipped IDEAS rows.
7. **[M] Make invisible states visible.** Report-only: done units lacking readiness markers (two of three course lessons are permanently exempt today), unit/marker disagreements (lesson-0 carries a foreign courseSlug), corpus/cards drift. One `unitState()` returning `{authored, reviewed, done, packaged, delivered}` as the single input to every guard, so `--force` on a DELIVERED collection needs a distinct second flag ("delivered" is the state red line 2 is about, and no guard consults it today).

### WS8 - Models, pinning and pass mechanics [5 items]

1. **[S] Per-pass env scopes with per-scope timeouts.** One knob currently covers both chapter extraction (misses structurally invisible) and the pedagogical sort (mechanically validated, fails open). Raising effort without raising the 10-minute spawn ceiling converts a quality knob into a mid-chapter abort.
2. **[L] Per-pass eval fixtures, BEFORE WS3's prompt rewrites land.** One reviewed lesson per pass as input → human-approved reference output; diff before/after each prompt edit for a human to judge (never auto-pass/fail; extraction is generative). Start with extraction. Downgrades toward cheaper models stay rejected until measured this way.
3. **[M] Raise extraction to effort high (after per-scope timeouts); batch the conventions pass with a verifiable per-chapter coverage anchor.** The conventions pass currently self-certifies reading 57 files inside one 10-minute ceiling: the exact silent-degradation signature, in the artifact that steers every extraction.
4. **[S] Fix the two pass mechanics that lose work.** Translate retry currently re-sends the identical unbatched prompt (deterministically identical failure); halve the failed set instead. Apply audio.js's proven re-read-and-merge pattern to prepare/crossLessonNotes (a dashboard edit during a 10-minute pass is silently overwritten today).
5. **[S] EOCD entry-count throw in the zip writer; keep media memoization deferred** (1% saving vs re-entering the code path whose last reasonable change produced an Anki-rejected .apkg that passed every test).

## Contested rulings worth knowing (dissents preserved in the full JSON)

- **Test-suite library leak ranked as the plan's #1 item** over the QA view that it was one bug: five reviewers found it independently and the class (nothing asserts where a command writes) outranks the instance.
- **Hand-rolled EPUB stack stays** (tech lead argued for a library). Ruling: the parser's unit coverage is genuinely strong, the failures found are in policy not parsing, and a dependency swap would reset that maturity; revisit only if the fixture suite (WS2 item 8) starts failing structurally.
- **The ~15 new checks all land on preflight, but only after WS1 items 1-2** (the scope/severity substrate); dumping them on today's preflight was ruled "wallpaper".
- **`--apply` demoted across the board**: scripts propose, humans/agents dispose. Directly from your red line.
- **Kanji-orthography TTS is not made the global default** (linguist wanted it); cache re-billing + silent mixed-orthography risk; A/B on new units first.
- **Per-pass model downgrades rejected** until eval fixtures exist; the prompt engineer's scope split ships, the "lower toward Haiku" half does not.
- **Red team, round 2**: pre-push hook must NOT run preflight (would couple `git push` to unversioned deck state); build-side direction suppression struck as inert-and-self-reversing; unconditional re-file struck as an unflagged live mutation.
- **Red team, round 3**: delivery fail-closed gate re-specified because the data it referenced does not exist yet; live-Anki probes moved to a second profile with a rename-proof interlock; suspend-at-delivery held to the same consent standard as changeDeck.

## Execution model: parallel Opus agents (your decision)

**All spawned agents run on Opus** (`model: "opus"` on every Agent/workflow call — none on Fable; usage constraint). The main session acts only as a thin orchestrator: spawn waves, relay human gates, restart failures.

**Roles:**

- **One Opus worker per workstream**, each in its own git worktree (`isolation: worktree`) on its own branch (`ws0-state`, `ws1-verify`, `ws2-epub`, ...), scoped strictly to its workstream's items. Commits and pushes incrementally (golden rule 4a); never touches main.
- **One Opus integration agent** owns main: merges pushed branches `--no-ff` in dependency order, resolves conflicts per CLAUDE.md's merge rules (preserve both sides' intent, re-run the full Definition of Done on the merged result), `npm run ci` green before every merge (the pre-push hook enforces this anyway). It is the only writer of main.
- **Orchestrator (main session)**: spawns each wave when its prerequisites have _merged to main_, relays the human gates below, reassigns or restarts dead workers. Workers rebase on main after each integration-agent merge that touches their inputs.

**Known conflict hotspots the integration agent should expect** (and the wave design minimizes): `scripts/preflight.mjs` (WS1/WS4/WS7 all add checks — WS1's check registry merges first so later checks arrive as additive registry entries, not edits to one file); `src/model/index.js` (WS0 item 5, WS3 item 0, WS4 item 7); the `docs/` prompt files (WS3 before WS4/WS5 by wave); `references/deliver.md` (WS1 item 10 + WS6 — integration agent unions).

**Wave 1 — immediately, in parallel:**

- **WS0 worker** (the only agent allowed to touch `output/` and `.anki-builder/` in this wave; everything destructive elsewhere waits for its merge).
- **WS2 worker** (parser hardening, probe script, fixtures: pure `src/corpus/` + new scripts, no protected-state mutation; internal order: detectors and fixtures before the item-4 layout change).
- **WS7 worker** (docs truth sweep, watcher/finalize scripts; defers its item 7 preflight lines until WS1's registry exists — hands them to wave 3).

**Wave 2 — when WS0 has merged:**

- **WS3 worker**: item 0 (`ttsText` rename) FIRST and pushed immediately so the integration agent can land it before WS1's schema-adjacent work deepens; then waits for WS8's extraction fixture to merge before the prompt rewrites (items 1-6).
- **WS1 worker**: substrate (items 1-2) first and pushed early (unblocks check authors), then items 3-9. Item 10 starts when the human gate below clears.
- **WS8 worker**: item 2 (extraction eval fixture) first and pushed immediately (WS3 is waiting on it); then items 1, 3-5.

**Wave 3 — when WS1 items 6+9 and WS3 item 5 have merged:**

- **WS4 worker** (card quality; item 5 behind the merged model-diff guard; item 6 additionally behind WS1 item 10's probe results).
- **WS5 worker** (audio; items 3-4 touch the prompt files WS3 has now finished with).
- **WS6 worker** (delivery; items 2-3 behind WS1 item 10; the one-time `--refile` migration is the last act, behind the human preview gate).

**Human gates during execution (the orchestrator relays these to you):**

1. Create the `ANKIBUILDER-PROBE` profile + sentinel deck when WS1's worker reaches item 10 (wave 2; two minutes in Anki's profile manager).
2. Preview and approve the one-time `--refile` deck-name migration diff (wave 3, WS6).
3. ACK decisions when a newly landed check is red on live data and the worker proposes accept-vs-fix.

## Verification

- Each workstream's checks are self-verifying by design (they run red/green against live data; several are documented as red on landing day with the fix/ACK in the same commit).
- `npm run ci` stays green throughout; new `npm run check` adds the deck-state gates manually.
- The headless import verifier (WS1 item 9) is the end-to-end proof for anything touching .apkg structure.
- Probe results (WS1 item 10) are recorded in `references/deliver.md` before any gated item ships.
- The eval fixtures (WS8 item 2) are the before/after evidence for every WS3 prompt change.
- Empirical acceptance for the priority goal: `scripts/epub-probe.mjs` run against the Betrayer novel must surface every degradation the adversarial agent found manually (unreachable spine 1, 0/35 lesson classification, swallowed files, label collision).

---

## Owner ruling: collection isolation (2026-08-14)

**Appended after the fact. The sections above are the plan as it was approved and executed, and they
are left unedited on purpose: this addendum is what changed, not a rewrite of what was decided.**

### The ruling

Completely different Anki decks (collections: the JBP book, the Nihongo course, a bundled template)
must be processed in **complete isolation**. They must never overlap, be compared, be cued against
each other, or be considered in reference to each other in any way.

Within a single collection, cross-referencing remains correct and unchanged. A book's lessons and its
`-extras` units are one product being made coherent with itself, so the backward dedup library, the
cross-lesson note pass, the duplicate check and the collision audit all stay exactly as the plan
describes them. The boundary is the collection, not the lesson.

### What this overturns

The plan's whole "the deck boundary is not the interference boundary" thread is withdrawn. The
reasoning behind it (Anki interleaves every deck studied that day, and matches note guids
collection-wide) was factually right about Anki and wrong about what this project should do with two
separate products. The owner studies both decks; they are still two decks.

**WS1 item 4 (workspace-scope checks): the two content checks were REMOVED after landing.**
`cross-collection-ids`, `cross-deck-prompts` and `cross-deck-glosses` were written, tested, merged,
and then deleted on branch `ws1-isolation`. The third part of that item, the stray-`.apkg` check,
stays: it reads one collection's own folder and compares nothing.

**WS4 item 8 (hand-cue the scarf pair and the 10 uncued cross-deck ambiguities): DROPPED from Wave 3.** It exists only to resolve findings that are no longer findings. `スカーフ` in the book and
`マフラー` in the course are two products' cards; neither is cued against the other, and neither
needs to be.

**Rulings affected.** "Severity of the cross-deck card-id / bare-guid collision (qa-2)" and the
finding behind it (learner-1, 47 cross-deck target dupes and 10 uncued English prompts) are
superseded in their prescription, not in their observation. The observation is still true and is now
simply not something this project acts on.

### What survives, and how it is handled

One mechanical concern outlives the ruling: two collections that both ship **bare guids** can
overwrite each other's notes if both are `.apkg`-imported into the same Anki collection, because Anki
matches guids collection-wide. That is a packaging property, not a content comparison, and the
mitigation needs no comparison at all:

- per-deck guid namespacing (WS6 item 5), which is decided per collection at its creation, and
- the runbook rule that a bare-guid deck is never `.apkg`-imported into a collection already holding
  another bare-guid deck.

Neither requires reading a second collection's cards, and neither is permitted to.

### Where the rule now lives

`CLAUDE.md` golden rule 7, `src/audit/registry.js` and `src/audit/checks/index.js` (with a test that
fails if a workspace-scope check is added without review), `references/card-authoring-rules.md`
(scope stated once for the whole file), and an entry in `.harness/custom/docs/LIMITATIONS.md`.

---

## Status at close of the build phase (2026-08-17)

All nine workstreams are merged. Main carries the whole plan except the items listed below, `npm run ci`
is green (1,303 tests), and `npm run preflight` is clean on the real output tree.

### Owner ruling: probe-gated features are DEFERRED, not pending

Two of the five behaviour probes were run on 2026-08-17 against an empty throwaway profile
(`template-update-regenerates-card` and `template-update-unsuspends`, both "no"). The remaining three
need a card in a filtered deck, which AnkiConnect cannot create, so they need a human GUI step.

The owner has decided **not to pursue the remaining probes for now**, and to work the questions out as
they come up in real use instead. So these features stay refused, and that is a deliberate resting
state rather than unfinished work:

| feature                                                                  | waiting on                                       |
| ------------------------------------------------------------------------ | ------------------------------------------------ |
| `--refile` (the one-time deck-name migration)                            | `change-deck-on-filtered`                        |
| `--suspend-delivered` (direction suppression on already-delivered notes) | `suspend-on-filtered`, `housekeeping-unsuspends` |
| `--suspend-orphans`                                                      | `suspend-on-filtered`, `housekeeping-unsuspends` |

Each refuses with a message naming the missing evidence and the command that would produce it, so the
route forward is discoverable at the moment someone wants the feature. `--dry` previews are not gated.
The deck-name migration the owner approved in principle therefore does not happen yet; the existing
book keeps its current deck names, which was already the scheduled behaviour (WS2 item 6 ships the
decoder fix new-books-only).

`--allow-template-add` is no longer gated, because both of its probes are answered. Caveat recorded
honestly: the probes measured a template UPDATE, and a template ADD is a different operation that
generates a card per note by design. Nothing adds a template today (the owner chose no new card
directions), so this is not load-bearing, but the gate is weaker than it looks and should be given its
own evidence before anyone relies on it.

### Not done, by decision or by cost

- **WS2 item 4**, mirroring the archive layout under `chapters/`, deferred by its worker on
  ruling-R6 grounds. The image collision it would close by construction is detected two other ways.
- **`vocab-coverage` has never run against live data.** It needs a cached chapter file, which means an
  `assemble` run, which is a paid pass. It skips honestly rather than reporting a false pass.
- **412 `romaji-style` findings** (INFO) will not clear on their own: the fix is re-running the
  romanization pass over already-delivered units, a paid pass on reviewed content. The owner confirmed
  hyphenated `-san` as the pinned standard on 2026-08-15, which is why the ~201 spaced cards report.
- **Extraction runs at effort `high` unmeasured.** The eval harness exists; comparing medium against
  high on one chapter is two paid calls nobody has spent.
- **One genuinely stale audio clip**, `nihongo-101-course-n5/lesson-0/irl-l1-31`, is badged and left
  alone: fixing it means spending a TTS credit or discarding a hand-picked take.
- **The card-face improvements are built but not delivered.** They need one `deliver --dry` review, then
  `--allow-model-change`, then one manual AnkiWeb upload. Not probe-gated; waiting only on the owner.
