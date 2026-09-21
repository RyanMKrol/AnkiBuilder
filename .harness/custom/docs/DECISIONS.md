# DECISIONS.md — settled choices, and what would reopen them

**These are not limitations.** Each one is a choice that was made deliberately, for a reason that
still holds. They live here so nobody re-litigates them, and so
[`LIMITATIONS.md`](./LIMITATIONS.md) can stay a queue of things someone might actually act on.

The distinction is whether there is work waiting. "The delivery add ceiling is a fixed 200, not a
proportion" is settled: the number is arbitrary on purpose and a proportion would be worse. "The
template path has never been built end to end" is not settled, it is a gap, and it belongs in
LIMITATIONS.

**An entry here can still be wrong.** If the reason a decision was made stops holding, reopen it:
move it back to LIMITATIONS with what changed. That is a normal thing to do, and it is why each
entry says what its reasoning rests on rather than just what was decided.

Several of these were ruled on directly by the owner and should not be reopened without asking:
collections are isolated (2026-08-14), the `Reading` note-type field is never rendered (2026-08-14),
and the two delivered collections keep their bare note guids.

To list what is here: `grep '^## ' .harness/custom/docs/DECISIONS.md`

## A deck that holds cards is never given children

- **What:** units that belong together (a lesson and its extras drills) nest under a **grouping deck**
  that holds no cards of its own — `Book::Lesson 5::Shopping (2)…` beside
  `Book::Lesson 5::Shopping (2)… (Extras)`. A deck containing cards is never made a parent.
  `src/deck/deckPath.js` derives every unit's path, for the `.apkg` and AnkiConnect alike.
- **Why:** Anki studies a parent deck together with every deck beneath it, so a card-holding parent
  cannot be studied on its own. This was learned twice. First the drills were nested under the LESSON
  deck, which made the lesson unstudyable alone. Then they were flattened to siblings, which fixed
  that but produced an unreadable wall of long names and lost the ability to study a lesson and its
  drills together. The grouping deck gives all three modes because it holds nothing.
- **Impact:** the tree is derived from a label convention (`"Lesson N: Title"`) by regex in
  `unitDeckSegments`, so a book whose TOC labels its units differently gets no grouping and falls back
  to one flat level. That is a silent degradation, not an error. Renaming a base lesson also re-groups
  it, orphaning its extras under the old group name until both are renamed together.
- **Status:** open
- **When to revisit:** if a second book's labels don't match the convention, replace the regex with an
  explicit `meta.deckGroup` field rather than widening the pattern.

## Converted books number their study units as chapters

- **What:** every book converted from page images (`scripts/remaster-epub.mjs`) labels its study units
  `Chapter NN: <the book's own name for the unit>`, numbered in page order, zero-padded:
  `Chapter 06: Lesson 1: New Friends`, `Chapter 18: Reading and Writing 1: Hiragana`. Front and back
  matter (cover, preface, contents, indexes) stay in the outline as a record and are left out of the
  converted EPUB. The numbers are assigned in code (`numberChapters`, `src/remaster/outline.js`), never
  by a model. Owner ruling, 2026-09-21, for all books going forward.
- **Why:** one rule has to cover any book, however it names its own parts. Genki has two numbered
  sequences (Lesson 1 to 12 and Reading and Writing 1 to 12); left as they were, the second fell outside
  the deck grouping and sorted "10" between "1" and "2". `Chapter N: Title` already matches
  `unitDeckSegments`, so this needed no change to the deck contract above (the regex was not widened).
  Leaving front and back matter out makes a chapter's number, its `--lesson` ordinal and its spine
  position the same number, and stops an index from posing as a "later chapter" to the forward-flag
  check. The book's own name stays in the label because its exercises and cross-references use it.
- **Impact:** chapters follow page order, not a book's suggested study order. Genki means Reading and
  Writing N to be studied beside Lesson N; here Hiragana is Chapter 18, after the twelve conversation
  lessons. Studying decks in another order in Anki is unaffected. Output folders (`chapter-N`) are still
  numbered by build order, as they are for every book, so they need not match.
- **Status:** decided
- **When to revisit:** if a book's study order matters enough that page order misleads, add a
  study-order field the outline reads from the book and a person confirms, rather than renumbering by
  hand.

## Scene cues on ambiguous single-word cards partially reveal the answer (by design)

- **What:** the `Scene` field renders on the front of BOTH card directions. For sentence cards a
  scene names the question just asked and reveals nothing. For an ambiguous single-word card
  (に "2" vs the direction particle, ほん "Book" vs the counter), any cue that disambiguates the
  Recognition front necessarily points partway at the answer ("counting, not the particle").
  Three degenerate pairs were left with no scene at all at the time of the scene migration, because
  no non-revealing wording existed and their glosses barely differed: です ("To be" vs
  "Is / am / are"), ばん ("Evening" vs the number suffix), and ばんごはん ("Dinner" twice).
- **Why:** an answerable-but-easier card beats an unanswerable one; the Production direction keeps
  full rigor because definitional hints stay off the Recognition front (they show on its back).
- **Impact:** a handful of Recognition cards are softer tests than a purist would like. **The three
  named pairs are no longer among them** (checked 2026-08-14 against the live deck): the second です
  card (`desu-suffix-ch15`) and the duplicate ばんごはん (`chapter-3-extras`) are both excluded, so
  neither pair exists any more, and both ばん cards now carry a scene ("the time of day" /
  "labelling something by its number"). The general trade-off stands; the examples do not, which is
  why this row now points at a command instead of a count.
- **Status:** open (the design trade-off), with all three cited instances resolved
- **Verified by:** `node scripts/extras-collision-audit.mjs <collection-dir>` — it lists every group
  sharing a gloss or a target and flags members with no cue on the face they collide on
- **When to revisit:** if a future uncued pair causes real study friction, merge it into one card
  with a combined gloss instead of inventing a leaky scene. The scene migration's pre-change state
  is in `*.pre-scene.bak` beside every `cards.json` / `corpus.json`.

## Anki deck names carry a zero-padded lesson number

- **What:** `unitDeckSegments` pads a label's lesson number to two digits when deriving the Anki
  deck name (`Lesson 9: Title` -> deck `Lesson 09::Title`). The unit's label is untouched
  everywhere else, so `cards.json`, the dashboard and the card faces still read "Lesson 9".
- **Why:** Anki sorts sibling decks as text, with no natural-number sort and no manual ordering, so
  an unpadded deck list runs 1, 10, 11, 2, 3. Padding is the only lever available.
- **Impact:** two digits caps a book at 99 lessons before the sort breaks again, and the deck list
  reads "Lesson 01" where the book says "Lesson 1". Any collection created before this change needs
  the one-shot `scripts/migrate-deck-numbering.mjs` (create + changeDeck + delete the empty
  original, since AnkiConnect has no rename action), or delivery will file new cards in the padded
  deck while old cards sit in the unpadded one.
- **Status:** open
- **When to revisit:** if a book ever exceeds 99 lessons, or if Anki gains a natural sort, in which
  case the padding can be dropped and migrated the same way.

## Un-shipping a unit changes the package, never the live Anki collection

- **What:** `scripts/undone-unit.mjs` backs up `cards.json`, clears `meta.done` and rebuilds the
  collection package. It does not talk to Anki, so notes already delivered stay in the live
  collection with their scheduling; the unit simply stops being in the next package.
- **Why:** removing delivered notes is a destructive, unrecoverable act on a deck the user studies
  daily, and it is a different decision from "this unit is not finished after all". `deliver-to-anki`
  already reports orphans and refuses to delete them, for the same reason.
- **Impact:** after un-shipping a delivered unit, its cards keep coming up in study until someone
  removes them in Anki by hand. The script requires `--force` on a collection carrying
  `anki-delivered.json` so the gap is stated at the moment it matters, not discovered later.
- **Status:** open
- **When to revisit:** if un-shipping delivered units becomes common, give the deliverer an opt-in
  `--suspend-orphans` (already specified for the exclusion case) and point this script at it.

## The Anki note-type field is still called "Reading" after the JSON field became `ttsText`

- **What:** the pipeline's `reading` field was renamed to `ttsText` everywhere (schemas, prompts,
  passes, dashboard, tests, and all 46 tracked cards.json / corpus.json / dedup-corpora files). The
  Anki note type's field keeps the name "Reading", and `src/deck/collection.js`'s `fieldValue` maps
  `ttsText` onto it in one line.
- **Why:** renaming a field on a live note type rewrites every note in both delivered collections and
  forces a one-way AnkiWeb sync, for a field no template renders. The point of the rename was to stop
  future agents reading the name as a display field; inside Anki the field is invisible, so the risk
  it was fixing does not exist there.
- **Impact:** one place in the repo (that `case "Reading":` arm) knows both names, and anyone reading
  the note type in Anki sees a name that no longer matches the JSON. A future note-type migration that
  does touch field names should fold this in.
- **Status:** open (deliberate; the mapping is one line and is commented)
- **When to revisit:** whenever a note-type field migration happens for another reason, or if a
  template is ever given a reason to render the value (which would need a decision first: today the
  rule is that `ttsText` is never rendered on any card face).

## Preflight is not in `npm run ci`, and deliberately not in the pre-push hook

- **What:** `npm run ci` (which the pre-push hook runs) stays format/lint/test/build. Preflight and
  `validate:decks` are the separate `npm run check`, run by hand.
- **Why:** `npm run ci` asserts on tracked state and passes in a fresh clone. Preflight asserts on
  `output/`, whose bulk is gitignored and untracked. Wiring it into the hook couples `git push` to
  unversioned deck state, is a no-op in CI and a fresh clone by construction, and would block a README
  typo behind a deck rebuild whose only escape is `--no-verify`.
- **Impact:** the deterministic gate is only as reliable as the habit of running it. Nothing forces
  it before a review link is handed over or before a deliver; the skill doc says to, and that is all.
- **Status:** open
- **When to revisit:** if the gate is skipped in practice, add the preflight half to the hook as
  ADVISORY: print, never contribute a non-zero exit.

## Collections are isolated, so nothing detects a bare-guid overlap between two decks

- **What:** an owner ruling on 2026-08-14 established that two collections (one book, one course, one
  template) are two separate products and must never be overlapped, compared, cued against each
  other, or considered in reference to each other. Three preflight checks that did exactly that
  (`cross-collection-ids`, `cross-deck-prompts`, `cross-deck-glosses`) had already been written,
  tested and merged. They were removed on branch `ws1-isolation`, along with WS4 item 8, which
  existed only to resolve their findings.
- **Why:** the checks were built on the observation that Anki interleaves every deck studied that day
  and matches note guids collection-wide. That observation is true, and it is not the rule this
  project follows. A deck is authored, reviewed and shipped as one product; making one product's
  wording answer for another's turns every new deck into a re-review of every old one, and the cue
  it would ask for ("say which scarf you mean") is a cue the learner of either deck alone does not
  need.
- **Impact:** the one mechanical concern the removed checks also covered now has nothing watching it.
  Both live collections ship BARE guids, decided once at each folder's creation and deliberately
  frozen there. If both are ever `.apkg`-imported into the same Anki collection, notes sharing an id
  overwrite each other silently. That was measurable at the time of the ruling (ten shared ids, nine
  byte-identical, one differing: スカーフ vs マフラー, both glossed "Scarf"). It is now unwatched by
  design, because detecting it requires reading two collections' cards together.
- **Mitigation, and it needs no comparison:** per-deck guid namespacing (WS6 item 5) makes the
  overlap impossible by construction, and is decided per collection at creation with no reference to
  any other. Alongside it, the delivery runbook rule: never `.apkg`-import a bare-guid deck into a
  collection that already holds another bare-guid deck. In-place AnkiConnect delivery is unaffected,
  because it matches on the `abid:` tag rather than the guid, and it is the normal path for a deck
  the owner already studies.
- **Status:** open
- **Verified by:** `node scripts/preflight.mjs --all` reports no cross-collection findings by
  construction; `grep -rn "guidNamespace" output/*/*/book.json output/*/*/course.json` shows which
  collections are bare.
- **When to revisit:** when WS6 item 5 lands guid namespacing for new collections, note here that new
  decks are safe by construction and that the two pre-namespace decks stay bare forever (renaming an
  existing deck's guids would orphan its live scheduling). Do not revisit by reintroducing a content
  comparison.

## vocab-coverage reports at INFO, and only where the chapter cache exists

- **What:** the vocabulary diff runs two ways: `scripts/vocab-coverage.mjs <chapterFile> <unitDir>`
  for one unit, and a `vocab-coverage` check in preflight (`src/audit/checks/vocab.js`) over every
  base unit of an EPUB collection. The matching lives in `src/cards/vocabCoverage.js` behind tests.
  The check is INFO, and it SKIPS rather than passes when a unit's chapter file is not cached.
- **Why:** INFO because the check has known false positives that only a human can dismiss (a book
  prints its vocabulary in ways no string match resolves), and the standing rule is that a blocking
  check ships with the fix or the ACK for its live instances. Nobody has looked at a live count yet:
  the chapter cache is a free re-inflate of the EPUB and is untracked, so it is absent in a fresh
  clone and in every worktree, and this check has never been run against real chapters.
- **Impact:** the check contributes nothing to the exit code, and on a machine without the chapter
  cache it reports a skip line rather than a number. The skip is the honest answer, but it means the
  gate is only real on the machine that built the book.
- **Status:** open — INFO on purpose, pending a live count.
- **When to revisit:** run `npm run preflight` on the machine holding the chapter cache, read the
  findings once, then either fix them or promote the check to ACK in the same commit that accepts
  the residue.

## The romanization style hook exists but is empty

- **What:** `docs/romanization-prompt.md` takes a `{{ROMANIZATION_STYLE_RULES}}` fragment from
  `languageRules.js`'s `romanizationStyle`. No language sets it, so today it renders as nothing.
- **Why:** the move of the four translate prompts into `docs/` had to stay a move. Pinning a Hepburn
  spec is a separate, opinionated change (the deck's romanization drifts per batch: trailing periods
  100% in some units and 0% in others, `-san` hyphenated 32/32 in one unit and spaced 40/40 in the
  next), and mixing it into the move would have made both harder to judge.
- **Impact:** the drift is unchanged until something fills the fragment in. The hook makes that a
  one-place edit rather than four.
- **Status:** open — the hook is deliberate groundwork, not an oversight.
- **When to revisit:** the pinned-Hepburn work. Fill `romanizationStyle` for `ja` and every prompt
  that romanizes inherits it.

## The Japanese font rule was narrowed differently from the plan

- **What:** the plan asked for the webfont to be scoped "to the target rather than `.card`".
  `languageFontCss` still targets `.card`; what changed is its Latin fallback, from
  `"Helvetica Neue", Helvetica, Arial, sans-serif` to `arial` (the card's own stack).
- **Why:** the `@font-face` already carries a `unicode-range` covering only kana, kanji and CJK
  punctuation, so the font can never render a Latin glyph no matter which selector it is on — the
  scoping the plan wanted is already there, per glyph. Narrowing the SELECTOR to the prompt and
  answer elements would have stripped the textbook face from the Japanese quoted inside a `note` or a
  `scene`, which the learner reads too. The real defect was the fallback: registering a Japanese font
  silently restyled every Latin string on the card.
- **Impact:** none on the target script. Latin text on a `ja` card now renders in `arial` (what
  BASE_CSS asks for) rather than Helvetica Neue.
- **Status:** open — recorded because it is a deliberate deviation from an approved plan item, not
  because anything is wrong.
- **When to revisit:** if a language is ever configured whose font has no `unicode-range`, the
  `.card` selector stops being safe and the narrowing becomes necessary after all.

## The .apkg no longer reproduces the delivered deck card-for-card

- **What:** the `.apkg` builder emits BOTH card rows for every note, including one carrying
  `dirSuspended`; the AnkiConnect deliverer suspends the unwanted ordinal. So a package built from a
  collection differs from the live deck by exactly those suspensions.
- **Why:** omitting the row at build time is inert on the delivery path (Anki generates one card per
  template on `addNote`) and self-reversing on the `.apkg` path (Check Database and any template
  update regenerate it), so the two builders would have drifted STRUCTURALLY for no gain. Keeping
  both rows keeps them structurally identical and puts the difference where it is intentional.
- **Impact:** importing a built `.apkg` into a fresh collection produces a deck with every direction
  live. Anything treating the `.apkg` as a faithful snapshot of the delivered deck — the freshness
  check, a restore-by-import — is comparing packages, not scheduling, and is unaffected; a human
  reading one as "what the owner sees" would be wrong.
- **Status:** open — accepted trade, recorded so it is not rediscovered as a bug.
- **When to revisit:** if `.apkg` import ever becomes the primary delivery path again, this inverts
  and the suspension has to move into the builder.

<!-- WS5 -->

## The audio text-hash badge is a badge, and 30 clips can never be checked at all

- **What:** `audioTextHash` records what text each clip was generated from, so the ~200 hand-picked,
  hand-trimmed and uploaded cards stop being exempt from the text-changed check. It reports, in the
  audio review (a **Text changed** badge) and in `npm run preflight` (`audio text hash`). It does not
  block "Mark done", and 30 live clips carry a hand-given name with no hash in it, so nobody can say
  whether they still match their card.
- **Why:** a block would have been the first ever gate on the owner's daily path, and a mismatch has
  no exit that does not destroy the reviewer's hand trim or hand pick — the "Keep this clip" button
  is the exit, and it is a decision, not a fix. The 30 are unverifiable because the only other way to
  give them a hash is to compute one from the card's current text, which would declare every drifted
  clip correct in a single pass and destroy the signal permanently.
- **Impact:** a stale clip still ships until a human acts on the badge. On the first live run the
  count was ONE (`nihongo-101-course-n5/lesson-0/irl-l1-31`, whose hand-trimmed clip was generated
  from text nobody can now reconstruct); it is left badged rather than regenerated, because deciding
  between spending credits and keeping the take is the owner's call. 106 clips report unverifiable:
  30 whose take carries a hand-given name with no hash in it, and the rest kanji takes generated
  before `ttsKanji` was stored on the card.
- **Status:** open — badge-only by design, pending a measurement of how often it goes red in practice.
- **Verified by:** `node scripts/preflight.mjs --all --only audio-text-hash --verbose`
- **When to revisit:** once the live stale count has been observed over a few chapters. If it stays
  at or near zero, promoting the check to ACK (accept-or-fix, not a hard block) is the next rung —
  the exit action and its provenance fields already exist, which is what a promotion needs.

## The two delivered collections keep bare note guids, and are not being retrofitted

- **What:** `output/epubs/japanese-for-busy-people-book-1-kana` and
  `output/courses/nihongo-101-course-n5` both write BARE card ids as their packages' note guids
  (`book.json` has `"guidNamespace": null`, `course.json` has no such field). Every collection
  created after 024184c gets a namespace from its immutable slug; these two do not, on purpose.
- **Why:** a guid is what Anki matches a note by at import. Changing the guids of an already-imported
  deck makes every note look new, so a retrofit trades a hypothetical import collision for a certain
  one. The owner ruled: namespace new collections from creation, leave these two alone.
- **Impact:** an `.apkg` import of one of them into an Anki collection already holding the other can
  overwrite notes that share a card id. The AnkiConnect path is unaffected (deck-scoped, matched by
  `abid:` tag), and the mitigation is the runbook rule that a bare-guid deck is never `.apkg`-imported
  into a collection holding another. `npm run preflight` prints each collection's mode.
- **Status:** open — deliberate, with a stated trigger.
- **When to revisit:** when `scripts/verify-apkg-import.mjs` has been run against a namespaced and a
  bare build of the same deck and shown what a guid change does to the restore path. That answer, not
  a preference, decides whether a retrofit is worth doing.
- **Verified by:** `node scripts/preflight.mjs --all --only guid-namespace`

## The delivery add ceiling is a fixed 200, not a proportion

- **What:** `DEFAULT_MAX_ADDS = 200` per collection per deliver, overridable only by
  `--allow-bulk-add` (there is no `--max-adds`).
- **Why:** the ceiling exists to catch a matching failure that would re-add a book, and a proportion
  of the collection's size would have been derived from the same lookup the failure broke. A flat
  number cannot be argued into being wrong by the bug it is watching for.
- **Impact:** the first delivery of any collection larger than 200 cards needs the flag, which is
  exactly the case where reading the `--dry` output is worth the minute. A future 190-card book
  would deliver in one go with no prompt at all.
- **Status:** open — deliberate.
- **When to revisit:** if a legitimate incremental deliver (not a first run) ever trips it.

## Relocated course cards keep a card shape the extras rules forbid for new cards

- **What:** `extras-pass.md` says "Do not add bare vocabulary cards, numbers, or counter recitations."
  A large share of the 134 cards moving out of Nihongo 101 are exactly that: bare nouns (Toy,
  Ladybird, Watch, Box, Star), the minute counters, the floor counters.
- **Why:** that rule governs **authoring new padding**, where a bare noun is filler the pass invented.
  These are pre-existing cards with real review history that the owner studies daily. Dropping them to
  satisfy a rule about authoring would delete studied content, which is a worse outcome than an extras
  unit containing some bare vocabulary.
- **Impact:** several extras units end up shaped less like the rule describes than a freshly authored
  unit would be, and a future reader comparing them against `extras-pass.md` will find a discrepancy
  that is intentional. Each relocated card carries a `reviewNote` naming its Nihongo 101 origin, so
  the provenance is visible on the card rather than only here.
- **Verified by:** `grep -l "Nihongo 101" output/epubs/japanese-for-busy-people-book-1-kana/*/cards.json`
- **Status:** open, and expected to stay open
- **When to revisit:** if a later pass tries to enforce the no-bare-vocabulary rule mechanically, it
  must exempt cards carrying the relocation `reviewNote`, or it will propose deleting studied cards.

## The additions gate is per CARD, which no other review state is

- **What:** a card retrofitted into a finished unit carries `addition: "<batch>"` and does not ship
  until it carries `additionReviewed: true`. Enforced by one predicate in `shippableCards()`, which is
  the single function both delivery paths call. Reviewed at `/additions/<type>/<id>`, the third review
  type, added 2026-08-25.
- **Why:** class notes keep arriving for material a deck taught chapters ago, so cards land in units
  that were signed off months before. The only mechanism that existed was to clear `done` on the unit
  and withdraw its corpus sign-off, which puts hundreds of approved cards back in front of a reviewer
  in order to approve about a dozen. Doing that by hand across fifteen units is what caused this to be
  built.
- **Impact:** every other review state in this project is per unit, and this one is not, so anything
  that reasons about "what is waiting for review" now has two shapes to handle. The dashboard's home
  page treats them separately on purpose. A pending card is also invisible to the deck while being
  fully visible to every audit, which is the intended asymmetry but is worth knowing before reading a
  count from one and comparing it against the other.
- **Verified by:** `node --test test/deck/shippableCards.test.js test/server/additions.test.js`
- **Status:** open, and expected to stay open
- **When to revisit:** if a retrofit ever targets a BASE unit rather than an extras unit. Approving an
  addition does not re-save the unit's reviewed corpus into the backward-dedup library, which
  `markCardsReviewed` does; extras units are exempt from that library anyway, so the gap is latent
  today and becomes real the first time a base unit is retrofitted.

## An addition passes TWO gates, because one was only ever right for the first batch

- **What:** a retrofitted card ships only with both `additionReviewed` (content) and `additionDone`
  (audio), mirroring a lesson's `reviewed` and `done`. It started as a single flag.
- **Why the single flag was wrong:** the first batch happened to be a migration, so its 133 cards
  arrived with clips already generated and "approve" could mean both "the text is right" and "ready
  to ship" at once. That is the exception, not the rule. The normal case is a PDF of class notes,
  where a card is authored with no clip at all and audio has to be generated BETWEEN the two
  sign-offs: content first so nothing spends TTS credits on a card that might be cut, audio second so
  no clip reaches a studied deck unheard.
- **Impact:** two flags per retrofitted card rather than one, and the additions page renders two
  groups instead of one. Both reuse the corpus and audio `STAGE_TABLES` entries, so the surface is
  the existing review filtered to a batch rather than a second implementation of it. The cost is that
  `isPendingAddition` is now a two-condition predicate, and anything reading it has to mean
  "not through BOTH" rather than "not approved".
- **Verified by:** `node --test test/deck/shippableCards.test.js test/server/additions.test.js`
- **Status:** open, and expected to stay open
- **When to revisit:** if a batch ever legitimately arrives fully voiced, the audio gate is still
  worth passing: a clip that was right in its old deck is worth hearing once in its new context.

## Most verbs have no citation form, and three of those are a real miss

- **What:** the deck cards verbs in whatever form the book prints. Twenty-four bare ます-form verb
  entries have no dictionary-form card anywhere in the collection. Twenty-one of those are expected:
  Japanese for Busy People Book 1 simply never prints their dictionary form, and the owner ruled on
  2026-09-05 that the deck follows the book's schedule rather than running ahead of it. **Three are a
  genuine bug:** Lesson 15's GRAMMAR 2 prose enumerates the Regular 2 verbs taught up to that point so
  the learner can derive their dictionary forms, and みせる, あげる and かりる were never carded
  although the chapter names them. The chapter's conjugation chart is a page image
  (`Page_145_Image_0001.jpg`), so extraction carded only what the prose beside it listed.
- **Why:** the twenty-one are a deliberate ruling, not an oversight. A batch supplying all twenty-three
  was authored, audio-generated and content-reviewed in 2026-09, then stripped back out: carding a
  citation form ahead of the lesson that explains the concept means meeting a form before its
  explanation, and gathering them into Lesson 15 (the one lesson that does teach it) piled that lesson
  with verbs whose own lesson was chapters earlier. It was applied by the spent migration
  `scripts/add-verb-forms-family.mjs`; see `docs/designs/verb-forms-family-2026-09.md`
  for the batch and the reversal, and the "Card every verb form the source teaches, and none it does
  not" rule in `card-authoring-rules.md`. The three-verb miss has no such defence and is simply open.
- **Impact:** a learner through Lesson 16 can say たべます and not たべる for most verbs, which is the
  plain register informal speech runs in. Lessons 17 to 24 introduce more forms and will close part of
  it as they are built. Nothing mechanical will catch the next miss of the Lesson 15 kind: there is no
  `preflight` check for a citation form the source teaches and the cards lack, because a general check
  needs per-language morphology this tool deliberately does not carry (deciding かります is Regular 2
  while おくります is Regular 1 is a lookup, not a transformation).
- **Status:** open — three verbs are a real gap against the source; the rest is by design
- **Verified by:** counts bare inflected-form verb entries against the citation-form cards that name
  them. Expect `24 with no citation form` until Lesson 17+ is built or the three are recovered:

```sh
node - <<'JS'
import { readFileSync, readdirSync } from "fs";
import { join } from "path";
const BOOK = "output/epubs/japanese-for-busy-people-book-1-kana";
const cards = [];
for (const d of readdirSync(BOOK, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  try { cards.push(...JSON.parse(readFileSync(join(BOOK, d.name, "cards.json"), "utf-8")).items.filter(i => !i.excluded)); } catch {}
}
const dict = cards.filter(c => /dictionary form/i.test(c.english));
const masu = cards.filter(c => /ます$/.test(c.target || "") && c.target.length <= 9
  && !/[.?!、。]/.test(c.english) && c.english.split(/[ ,]+/).length <= 4
  && !/^(おはようございます|でございます)$/.test(c.target));
const missing = masu.filter(m => !dict.some(d => (d.note || "").includes(m.target)));
console.log(`${masu.length} bare ます-form verb entries; ${dict.length} citation-form cards; ${missing.length} with no citation form`);
JS
```

- **When to revisit:** recovering みせる, あげる and かりる into `chapter-15` is a small, source-backed
  fix worth doing on its own; it needs no ruling because the chapter names them. The other twenty-one
  stay open until the book teaches them.

## Book 1's family vocabulary stops short of siblings, and the deck is faithful to that

- **What:** the Japanese for Busy People deck teaches twelve family terms, all of them from Lesson 9's
  own WORD POWER table (ごかぞく, おとうさん, おかあさん, おくさん, かぞく, ちち, はは, つま, かない,
  ごしゅじん, おっと, しゅじん). Siblings, children, sons and daughters are not missing from the
  extraction: the book does not teach them until Lesson 24, which this deck has not been built to.
  Grandparents (そふ, そぼ, おじいさん, おばあさん) and りょうしん never appear anywhere in Book 1, in
  any lesson or either glossary.
- **Why:** the deck follows the book's teaching order, and the forward-flag pass exists specifically to
  keep a lesson from carding vocabulary the book introduces later. Pulling Lesson 24's family table
  forward would have been the pass working incorrectly, not correctly.
- **Impact:** a learner studying through Lesson 16 can name their parents and spouse and cannot name a
  brother. The twenty-two-card `family-vocabulary` addition batch closes it ahead of the book, marked
  `aiSuggested`, and every card's `reviewNote` records whether it came from Lesson 24's table or is
  absent from Book 1 entirely. When Lessons 17 to 24 are eventually built, that batch will collide
  with Lesson 24's own extraction and the duplicates will need reconciling.
- **Status:** open (deliberate; the collision at Lesson 24 is the thing to remember)
- **Verified by:** the terms Book 1 never teaches, checked against the extracted chapter cache:

```sh
cd .anki-builder/epubs/1fab0f99d1195ad9/cache-v2/chapters &&
for w in そふ そぼ おじいさん おばあさん りょうしん; do
  echo "$w: $(grep -l "$w" *.xhtml 2>/dev/null | tr '\n' ' ')NONE-means-absent"
done
```

- **When to revisit:** when Lesson 24 is built. Reconcile the `family-vocabulary` batch against that
  lesson's own extraction before shipping it, keeping the earliest card id so Anki review history
  survives.

## `meta.phase` is a fact about the build that four consumers have to agree on

`prepare`'s fill-in-the-blank pass is skipped for a v2 phase unit, and the rule lives in exactly one
function (`drillPassExpected`, `src/cards/readiness.js`) because four places ask it: `prepare`
itself, the readiness gate, `resume`, and the `readiness-exemptions` audit check.

**Why it is one function.** The consequence of two of them disagreeing is not a wrong number. If
readiness keeps requiring the `enriched` marker while `prepare` stops setting it, a phase-built unit
shows no **Mark reviewed** button and can never be signed off, and nothing in the pipeline says why:
the phase ran, the corpus is there, the card set is complete, and the gate is simply absent.

**Impact.** A fifth consumer that reads `meta.enriched` directly will misreport every v2 unit, and
will look correct on the 34 v1 units it is tested against. The field is also on the corpus schema,
which `main` validates too, so a v1 tree reads it as an optional field it never sets.

**Status:** live, and this is the shape to keep. Revisit only if a consumer needs a different
question than "was the drill pass this unit's to run", at which point it wants its own predicate
rather than a second reading of this one.

**Verified by:** `grep -rn "meta.enriched\|meta\[.enriched" src/ | grep -v readiness.js`. Every
hit must be guarded by `drillPassExpected` or be inside `prepare`'s own `minesDrills` branch.

## The phase extraction is now the default, and the old pass stays reachable

`assemble` on an `--epub` source runs phase 1 unless `--extraction v1` says otherwise. It was the
other way round while the rewrite was being written, because `main` was finishing a book with the old
pass and both had to work side by side without a branch switch.

**Why the default inverted.** A unit built by the old pass is indistinguishable from a phase-built one
after the fact: same `corpus.json`, same schema, same review page. What it lacks is the coverage
adversary, the per-image verdicts and both deduplicators, and none of those absences is visible in the
output. So a forgotten flag produced a unit that read as fully built and was not, which is this
project's signature failure shape. The flag is no longer what stands between a chapter and the
pipeline meant to build it.

**The trade-off accepted.** The default is now per SOURCE rather than global: an `--epub` chapter gets
the phase, and a template or dictated word list gets the only extraction it can have, because phase 1
reads a chapter and those have none. That means `usePhaseExtraction` consults `flags.epub`, so the
answer to "which extraction is this" is no longer readable from the flag alone. Asking for the phase
on a source that cannot run it is an error rather than a silent downgrade, which is what keeps the
per-source default from becoming a second way to get the wrong pipeline quietly.

**Impact:** none on chapters 0-16, which are built and not rewritten. A future non-EPUB source type
that COULD support a phase would need this default revisited rather than inherited.

**Revisit when:** a third extraction exists, or a non-EPUB source grows a phase. At that point the
per-source boolean should become an explicit per-source table.

**Verified by:** `node --test test/cli/index.test.js` — two tests pin the default in both directions
(an `--epub` build with no flag must run the phase; a template build with no flag must not).

**Status:** current design.

## Some writes are deliberately left non-atomic

- **What:** `restyle-font --out` and `view-deck --out` (`src/cli/index.js`), the delivery backup
  (`src/anki/deliver.js`), and every `scripts/*.mjs` maintenance script still write directly.
- **Why:** the two `--out` paths are arbitrary user-chosen destinations with no concurrent reader, and
  rename is actively worse there — it replaces the inode, discarding any hardlinks/ACLs/xattrs set on an
  existing destination, and fails `EXDEV` if the destination is on another volume. The delivery backup
  writes into a freshly created timestamped directory with a single writer. The `scripts/` migrations
  are run by hand, one at a time, never concurrently.
- **Impact:** a torn file is possible at those sites only if you deliberately run two of them at once
  against the same path.
- **Status:** open
- **When to revisit:** if a script ever runs unattended alongside a build. The cross-lesson note pass
  is the one to watch: it reads every sibling lesson's `cards.json`, so running the whole-book form of
  `scripts/enhance-card-notes.mjs` while a lesson is being prepared reads that lesson mid-flight.

## Every clip is stored twice

- **What:** the cache and each run's `audio/` now hold both `<hash>.orig.mp3` and `<hash>.mp3`. The
  original is written even when the trim changed nothing, so the two files can be byte-identical.
- **Why:** an always-present sibling is what makes its ABSENCE mean exactly one thing ("this clip
  predates originals"). Writing it conditionally would conflate "the trim was a no-op" with "there is no
  original", and the review would have no way to tell a reviewer which one they're looking at.
- **Impact:** roughly 2x audio disk in `.anki-builder/audio` and in every run dir. A clip is tens of KB,
  so a large book is single-digit MB either way — but it does double, and the cache is not pruned.
  Only the shipping clip is embedded in the `.apkg`; originals never reach the deck.
- **Status:** open
- **When to revisit:** if the local library ever gets large enough to matter, prune `.orig.mp3` files
  for lessons already marked done — they're only needed while a lesson is still being reviewed.

## This project keeps no limitations log

- **What was decided:** the overlay `custom/docs/LIMITATIONS.md` was deleted on 2026-09-20. A
  correction goes where the thing is enforced -- a prompt, a check, `SKILL.md`, or a comment at the
  code site -- per golden rule 5.
- **Why:** it reached 199 entries and 4,265 lines, 138 of them still marked open, and 99% append-only
  across its whole history. Filing a problem had become a substitute for fixing one, and a queue
  nobody can read in one sitting steers nothing. Two of its entries were measurably wrong when
  checked: one described a fix that had moved rather than landed.
- **What this does not change:** the plugin-owned `.harness/docs/LIMITATIONS.md` still tells you to
  add rows to the overlay. That file is refreshed on harness upgrade and is not ours to edit, so it
  will keep saying so. This entry is the answer: ignore it, and read golden rule 5.
- **What would reopen it:** a recurring class of problem that genuinely has no enforcement site --
  nothing to put in a prompt, no check that could catch it, no code comment that would be read. None
  of the 138 open entries was that, which is why it went.

## A spent migration stays in `scripts/`, marked, rather than moving

- **What was decided:** a one-off migration that has already run against the live decks keeps a
  `// SPENT: <date>` header saying not to run it, and stays where it is.
  `test/scripts/spentMigrations.test.js` requires every `.mjs` in `scripts/` to be classified as
  either a standing tool or a spent migration, so a new script makes the suite red until someone
  says which it is.
- **Why:** moving them to `scripts/migrations/` would break every doc reference and every
  muscle-memory path, for a distinction that only has to be visible at the top of the file.
- **The spent ones**, named here so they stay discoverable from a document rather than only from a
  test array: `absorb-nihongo.mjs`, `migrate-nihongo-absorption.mjs`,
  `migrate-absorption-to-additions.mjs`, `migrate-reading-to-ttstext.mjs`,
  `backfill-audio-text-hash.mjs`, `add-verb-forms-family.mjs`, `enhance-card-notes.mjs`,
  `strip-restatement-notes.mjs`, `split-front-hint.mjs`, `jumble-number-runs.mjs`.
- **What would reopen it:** `scripts/` growing large enough that the two kinds are hard to tell
  apart by eye, at which point the folder split becomes worth its cost.
