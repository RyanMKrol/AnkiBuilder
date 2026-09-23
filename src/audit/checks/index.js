import {
  schemaCheck,
  cardIdsCheck,
  collisionsCheck,
  duplicatesCheck,
  spacingCheck,
  placeholderTargetCheck,
  exclusionsCheck,
  audioMarkerCheck,
  audioFilesCheck,
  audioTextHashCheck,
  chapterNumberCheck,
} from "./collection.js";
import { extrasLibraryWriteCheck, libraryCompletenessCheck } from "./library.js";
import { vocabCoverageCheck } from "./vocab.js";
import { taughtNeverUsedCheck } from "./taughtNeverUsed.js";
import { baseSplitCheck } from "./baseSplit.js";
import { strayPackageCheck, packageFreshnessCheck } from "./packages.js";
import {
  collectionStateCheck,
  corpusDriftCheck,
  guidNamespaceCheck,
  readinessExemptionsCheck,
  unitMarkerCheck,
} from "./state.js";
import { templateExemptionsCheck, sourceTypeCheck, unmatchedDirsCheck } from "./templates.js";
import { romajiStyleCheck, inlineRomanizationCheck } from "./romanization.js";
import { answerableAloneCheck, productionLengthCheck, nearSiblingsCheck } from "./cardQuality.js";
import { noteClaimsCheck } from "./noteClaims.js";
import { drillFrameCheck } from "./drillShape.js";
import { passLedgerCheck } from "./passLedger.js";
import { READING_CHECKS, readingSkippedChecks } from "./reading.js";
import { isReadingKind } from "../../model/deckKind.js";

// Checks that exist because of the SPEAKING deck: its Production card (collision cues, the production
// face length, answerable-alone), its romanisation, its drills and extras, its note pass, and its
// library bookkeeping. A reading collection (docs/designs/reading-decks/07) does not run them, and
// the reading checks below say which were skipped rather than letting "not run" read as "passed".
const SPEAKING_ONLY = [
  collisionsCheck,
  romajiStyleCheck,
  inlineRomanizationCheck,
  answerableAloneCheck,
  productionLengthCheck,
  nearSiblingsCheck,
  noteClaimsCheck,
  drillFrameCheck,
  vocabCoverageCheck,
  taughtNeverUsedCheck,
  baseSplitCheck,
  extrasLibraryWriteCheck,
  libraryCompletenessCheck,
  duplicatesCheck,
];
const SPEAKING_ONLY_IDS = new Set(SPEAKING_ONLY.map((check) => check.id));

/** A speaking-only check, made to skip a reading collection. */
function forSpeaking(check) {
  if (!SPEAKING_ONLY_IDS.has(check.id)) return check;
  return {
    ...check,
    appliesTo: (collection, workspace) =>
      !isReadingKind(collection?.deckKind) && check.appliesTo(collection, workspace),
  };
}

/**
 * Every check, in report order.
 *
 * Adding one is a single entry here plus a `defineCheck` in the file its scope belongs to — see the
 * "ADDING A CHECK" note in ../registry.js. Nothing in scripts/preflight.mjs needs editing: it is arg
 * parsing, a scope filter and a printer.
 *
 * ⚠️ COLLECTIONS ARE ISOLATED. Every check here reads ONE collection, or one unit inside one. There
 * are deliberately no checks that compare two collections' content: not their card ids, not their
 * prompts, not their glosses. Three such checks were written and merged, then removed by an owner
 * ruling on 2026-08-14 (see CLAUDE.md, "Collections are isolated"). Do not reintroduce them, and do
 * not add a new one. The `workspace` scope survives in ../registry.js as a mechanism, and a
 * workspace-scope check may iterate collections to apply PER-COLLECTION logic, but it must never
 * compare one collection's cards against another's.
 */
const SPEAKING_AND_SHARED_CHECKS = [
  passLedgerCheck,
  // unit scope
  schemaCheck,
  spacingCheck,
  placeholderTargetCheck,
  sourceTypeCheck,
  corpusDriftCheck,
  romajiStyleCheck,
  answerableAloneCheck,
  productionLengthCheck,
  noteClaimsCheck,
  drillFrameCheck,
  // collection scope
  collectionStateCheck,
  guidNamespaceCheck,
  readinessExemptionsCheck,
  unitMarkerCheck,
  cardIdsCheck,
  collisionsCheck,
  inlineRomanizationCheck,
  nearSiblingsCheck,
  chapterNumberCheck,
  extrasLibraryWriteCheck,
  libraryCompletenessCheck,
  vocabCoverageCheck,
  taughtNeverUsedCheck,
  baseSplitCheck,
  strayPackageCheck,
  packageFreshnessCheck,
  duplicatesCheck,
  exclusionsCheck,
  audioMarkerCheck,
  audioFilesCheck,
  audioTextHashCheck,
  templateExemptionsCheck,
  unmatchedDirsCheck,
  // workspace scope: none, on purpose. See the isolation note above.
];

export const ALL_CHECKS = [
  ...SPEAKING_AND_SHARED_CHECKS.map(forSpeaking),
  ...READING_CHECKS,
  readingSkippedChecks([...SPEAKING_ONLY_IDS]),
];

/** The subset `validate-decks` folds into: schema validation only, across every unit shape. */
export const SCHEMA_ONLY_CHECKS = [schemaCheck];
