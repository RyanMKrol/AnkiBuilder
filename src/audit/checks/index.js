import {
  schemaCheck,
  cardIdsCheck,
  collisionsCheck,
  duplicatesCheck,
  spacingCheck,
  placeholderTargetCheck,
  exclusionsCheck,
  audioMarkerCheck,
  chapterNumberCheck,
} from "./collection.js";
import { extrasLibraryWriteCheck, libraryCompletenessCheck } from "./library.js";
import { strayPackageCheck, packageFreshnessCheck } from "./packages.js";
import {
  crossCollectionIdsCheck,
  crossDeckPromptsCheck,
  crossDeckGlossesCheck,
} from "./workspace.js";
import { templateExemptionsCheck, sourceTypeCheck, unmatchedDirsCheck } from "./templates.js";

/**
 * Every check, in report order.
 *
 * Adding one is a single entry here plus a `defineCheck` in the file its scope belongs to — see the
 * "ADDING A CHECK" note in ../registry.js. Nothing in scripts/preflight.mjs needs editing: it is arg
 * parsing, a scope filter and a printer.
 */
export const ALL_CHECKS = [
  // unit scope
  schemaCheck,
  spacingCheck,
  placeholderTargetCheck,
  sourceTypeCheck,
  // collection scope
  cardIdsCheck,
  collisionsCheck,
  chapterNumberCheck,
  extrasLibraryWriteCheck,
  libraryCompletenessCheck,
  strayPackageCheck,
  packageFreshnessCheck,
  duplicatesCheck,
  exclusionsCheck,
  audioMarkerCheck,
  templateExemptionsCheck,
  unmatchedDirsCheck,
  // workspace scope
  crossCollectionIdsCheck,
  crossDeckPromptsCheck,
  crossDeckGlossesCheck,
];

/** The subset `validate-decks` folds into: schema validation only, across every unit shape. */
export const SCHEMA_ONLY_CHECKS = [schemaCheck];
