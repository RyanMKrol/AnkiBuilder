import { existsSync, statSync, readFileSync } from "fs";
import { basename, dirname, join, resolve } from "path";
import { resolveDeckPathForDir } from "../deck/deckFileName.js";
import { isUnitDir } from "../model/unitDir.js";

// What a review gate looks like from the OUTSIDE — the question "has the human signed this unit off
// yet, and did the work that sign-off triggers actually happen?"
//
// This is the logic behind `scripts/await-review.mjs` and `scripts/check-done.mjs`. It used to be a
// ~50-line shell snippet in SKILL.md, retyped once per unit (four times per chapter), which meant
// every rule below had to be re-obeyed by hand every time — and each rule here exists because it was
// broken at least once in a real build.

/** Poll outcomes, and the process exit code each one means. */
export const GATE_EXIT = {
  signedOff: 0,
  timedOut: 1,
  unreadable: 2,
  stalePackage: 3,
};

/**
 * The directory holding the package a unit ships in.
 *
 * A chapter/lesson unit ships inside its collection's single merged package, one level up — units
 * have no package of their own. Anything else (a template's language dir, a one-off run dir) IS its
 * own package's home.
 */
export function packageDirForUnit(runDir) {
  const dir = resolve(runDir);
  return isUnitDir(basename(dir)) ? dirname(dir) : dir;
}

/**
 * Reads a unit's cards.json, distinguishing "cannot read it" from "read it, not signed off yet".
 *
 * Conflating those two is the single bug that defeats the whole watcher mechanism, and it has
 * happened: a watcher armed with a RELATIVE path, after an earlier `cd` moved the shell's working
 * directory, threw MODULE_NOT_FOUND on every poll while a swallowed stderr made it look like
 * patience. The reviewer clicked Mark reviewed, nothing happened, and they had to send the message
 * the watcher existed to save. So: resolve the path here, and report unreadable as its own state.
 */
export function readUnitCards(runDir) {
  const cardsPath = join(resolve(runDir), "cards.json");
  if (!existsSync(cardsPath)) {
    return { cardsPath, error: `no cards.json at ${cardsPath}` };
  }
  try {
    return { cardsPath, data: JSON.parse(readFileSync(cardsPath, "utf-8")) };
  } catch (e) {
    return { cardsPath, error: `cannot read ${cardsPath}: ${e.message}` };
  }
}

function mtimeMs(path) {
  try {
    return statSync(path).mtimeMs;
  } catch {
    return null;
  }
}

/**
 * Where a unit stands at `gate` (1 = corpus review / `meta.reviewed`, 2 = audio review /
 * `meta.done`), as `{ status, exitCode, message }`.
 *
 * Gate 2 checks the ARTIFACT, not the checkbox. Mark done does two things — it sets `meta.done` and
 * it rebuilds the collection package — and the flag flips even when the rebuild fails. A watcher
 * that reads only the flag has announced a unit as shipped while the package silently kept the old
 * content (a duplicate card id refused the build; the dashboard said so and the watcher did not).
 * The package path comes from `resolveDeckPathForDir`, so the slug can never be mistyped.
 */
export function gateState(runDir, gate) {
  const { cardsPath, data, error } = readUnitCards(runDir);
  if (error) {
    return { status: "unreadable", exitCode: GATE_EXIT.unreadable, message: error };
  }

  const meta = data.meta || {};
  const flag = gate === 2 ? "done" : "reviewed";
  if (meta[flag] !== true) {
    return {
      status: "waiting",
      exitCode: null,
      message: `waiting for meta.${flag} on ${cardsPath}`,
    };
  }

  if (gate !== 2) {
    return { status: "signed-off", exitCode: GATE_EXIT.signedOff, message: "marked reviewed" };
  }

  const packagePath = resolveDeckPathForDir(packageDirForUnit(runDir));
  const packageAt = mtimeMs(packagePath);
  if (packageAt === null) {
    return {
      status: "stale-package",
      exitCode: GATE_EXIT.stalePackage,
      message: `marked done, but no package exists at ${packagePath} — the rebuild FAILED`,
    };
  }
  if (packageAt < mtimeMs(cardsPath)) {
    return {
      status: "stale-package",
      exitCode: GATE_EXIT.stalePackage,
      message: `marked done, but ${packagePath} is OLDER than cards.json — the rebuild FAILED`,
    };
  }
  return {
    status: "signed-off",
    exitCode: GATE_EXIT.signedOff,
    message: `marked done and ${packagePath} rebuilt`,
  };
}

/** A millisecond span written the way the flags accept it back (`45s`, `30m`, `2h`). */
export function formatDuration(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)}m`;
  return `${Math.round((ms / 3_600_000) * 10) / 10}h`;
}

/**
 * `30m` / `90s` / `2h` in milliseconds. A bare number is MINUTES, because every documented wait in
 * this project is expressed in minutes and a silently-seconds timeout would end a watch 60x early.
 */
export function parseDuration(text) {
  const match = String(text)
    .trim()
    .match(/^(\d+(?:\.\d+)?)\s*(ms|s|m|h)?$/i);
  if (!match) throw new Error(`cannot read "${text}" as a duration (try 30m, 90s, 2h)`);
  const unit = (match[2] || "m").toLowerCase();
  const scale = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[unit];
  const ms = Number(match[1]) * scale;
  if (ms <= 0) throw new Error(`a duration must be positive, got "${text}"`);
  return ms;
}
