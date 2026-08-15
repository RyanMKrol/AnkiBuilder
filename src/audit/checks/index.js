import {
  schemaCheck,
  cardIdsCheck,
  collisionsCheck,
  duplicatesCheck,
  spacingCheck,
  placeholderTargetCheck,
  exclusionsCheck,
  audioMarkerCheck,
  audioTextHashCheck,
  chapterNumberCheck,
} from "./collection.js";
import { extrasLibraryWriteCheck, libraryCompletenessCheck } from "./library.js";
import { vocabCoverageCheck } from "./vocab.js";
import { strayPackageCheck, packageFreshnessCheck } from "./packages.js";
import { templateExemptionsCheck, sourceTypeCheck, unmatchedDirsCheck } from "./templates.js";
import { romajiStyleCheck, inlineRomanizationCheck } from "./romanization.js";
import { answerableAloneCheck, productionLengthCheck, nearSiblingsCheck } from "./cardQuality.js";
import { noteClaimsCheck } from "./noteClaims.js";

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
export const ALL_CHECKS = [
  // unit scope
  schemaCheck,
  spacingCheck,
  placeholderTargetCheck,
  sourceTypeCheck,
  romajiStyleCheck,
  answerableAloneCheck,
  productionLengthCheck,
  noteClaimsCheck,
  // collection scope
  cardIdsCheck,
  collisionsCheck,
  inlineRomanizationCheck,
  nearSiblingsCheck,
  chapterNumberCheck,
  extrasLibraryWriteCheck,
  libraryCompletenessCheck,
  vocabCoverageCheck,
  strayPackageCheck,
  packageFreshnessCheck,
  duplicatesCheck,
  exclusionsCheck,
  audioMarkerCheck,
  audioTextHashCheck,
  templateExemptionsCheck,
  unmatchedDirsCheck,
  // workspace scope: none, on purpose. See the isolation note above.
];

/** The subset `validate-decks` folds into: schema validation only, across every unit shape. */
export const SCHEMA_ONLY_CHECKS = [schemaCheck];
