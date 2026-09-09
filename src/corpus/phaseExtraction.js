// Phase 1 as `assemble`'s extraction step.
//
// WHY THIS SEAM EXISTS AT ALL. v2 replaces ONE thing about an EPUB build: how a chapter becomes a
// list of candidate items. Everything `assemble` does around that step survives unchanged and is
// wanted unchanged — registering the book, the cached whole-book conventions, extracting the
// chapter's bytes, stamping the unit's identity, the backward dedup against what the book already
// taught, the forward flags for vocabulary a later chapter introduces, the pedagogical sort, the
// pass ledger, the run claim, and the automatic chaining into `prepare`. That list is most of the
// build, every item on it has been got wrong at least once, and the order it runs in is load-bearing.
//
// So phase 1 is wired in AS the extraction step rather than around it. `assemble --extraction phase`
// substitutes `runBasePhase` for `assembleCorpusFromChapter` and changes nothing else. The
// alternative was to re-implement the surrounding order inside the phase script, which is the risk
// without the reward: a second copy of a sequence whose whole value is that this one is proven.
//
// WHAT THE PHASE OWNS AND WHAT IT DOES NOT. The phase produces candidate items and the artifacts
// that justify them (per-image verdicts, the adversary's coverage diff, the as-generated snapshot).
// It knows nothing about the book those items belong to. `assemble` stamps epubHash, chapterNumber
// and chapterLabel afterwards, exactly as it does for a v1 extraction.
//
// WHY A RE-RUN REUSES INSTEAD OF RE-SPENDING. `assemble` is this project's resume command: re-running
// it on a half-built lesson is the documented recovery, and it already reuses an existing
// corpus.json. The phase has to behave the same way or recovery costs four agent calls every time.
// It also HAS to: `writeSnapshot` refuses to overwrite, on purpose, because a re-run that rebased
// its own pre-review baseline would make the learning pass report that the reviewer changed nothing.
// A phase that had already run and could not be re-entered would turn that safeguard into a crash on
// the recovery path.

import { existsSync, readFileSync } from "fs";
import { join } from "path";
import { runBasePhase } from "../agents/basePhase.js";
import { SNAPSHOT_FILE } from "../agents/snapshot.js";
import { loadBookHints } from "./epubLibrary.js";

/**
 * Runs phase 1 into `unitDir` and returns its corpus in `assemble`'s shape.
 *
 * `runPhase` is injectable for the same reason every model-calling collaborator in this codebase is:
 * so the seam is exercisable without spawning anything.
 */
export function extractBaseCorpus({
  unitDir,
  chapterFilePath,
  chapterHtml,
  targetLanguage,
  epubHash,
  log = () => {},
  runPhase = runBasePhase,
} = {}) {
  const corpusPath = join(unitDir, "corpus.json");
  if (existsSync(join(unitDir, SNAPSHOT_FILE)) && existsSync(corpusPath)) {
    const existing = JSON.parse(readFileSync(corpusPath, "utf-8"));
    log(
      `phase 1 already ran for this unit (${SNAPSHOT_FILE} is present) — reusing its ` +
        `${existing.items.length} item(s) rather than re-spending four agent calls`,
    );
    return existing;
  }

  const hints = epubHash ? loadBookHints(epubHash) : {};
  const result = runPhase({
    unitDir,
    chapterFilePath,
    chapterHtml: chapterHtml ?? readFileSync(chapterFilePath, "utf-8"),
    targetLanguage,
    meta: { hints },
  });

  for (const step of result.run.steps) {
    const counts = step.counts ? ` (${step.counts.in ?? "-"} → ${step.counts.out ?? "-"})` : "";
    log(`[phase:base] ${step.status === "ok" ? "·" : "!"} ${step.step}${counts}`);
  }
  if (!result.verdict.ok) {
    // Artifact-based verification, and it is the only kind that means anything here: a step can
    // return cheerfully having written nothing, and the next thing to look at this unit is a human.
    throw new Error(
      `phase 1 did not verify: ${result.verdict.problems.join("; ")}. The unit is left as it is so ` +
        `the artifacts can be read.`,
    );
  }
  if (result.gaps?.counts?.gaps > 0) {
    log(
      `[phase:base] the coverage adversary found ${result.gaps.counts.gaps} item(s) the corpus does ` +
        `not have — read candidates/coverage.json before the review`,
    );
  }

  // The phase already wrote corpus.json. Read it back rather than rebuilding it from `result`, so
  // what assemble carries forward is exactly what the artifact says.
  return JSON.parse(readFileSync(corpusPath, "utf-8"));
}
