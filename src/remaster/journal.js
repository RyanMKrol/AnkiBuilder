import { appendFileSync, existsSync, mkdirSync, readFileSync } from "fs";
import { basename, join } from "path";
import { appendRunLog } from "../agents/runLog.js";

// The remaster's record of itself, for whoever checks it afterwards: a person, or a checking agent.
//
// Two layers, split for the same reason the phases split them (src/agents/runLog.js):
//
//   agent-logs/NN-<role>.json   every model call, in full, including the replies that were
//                               rejected. The existing run-log format, so anything that already
//                               reads a unit's agent transcripts can read these.
//   journal.jsonl               one line per decision or check: a retry and why, a cross-check
//                               result, a comparison of two readings, a settle verdict and its guard,
//                               a build, a verify. Each line that rests on a model call names the
//                               agent-log file, so a finding can be traced to the reply behind it.
//
// Nothing branches on either. They exist so "was a mistake made, and where" can be answered from
// disk after the run, instead of from memory of a terminal that has since scrolled away.

export const AGENT_LOG_DIR = "agent-logs";
export const JOURNAL_FILE = "journal.jsonl";

export function appendJournal(root, event, { now = () => new Date().toISOString() } = {}) {
  mkdirSync(root, { recursive: true });
  appendFileSync(join(root, JOURNAL_FILE), `${JSON.stringify({ at: now(), ...event })}\n`);
}

export function readJournal(root) {
  const path = join(root, JOURNAL_FILE);
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

/**
 * Wraps a model runner so every call it makes is written to agent-logs/, reply and all, whether it
 * succeeds, is refused, or throws. Returns the wrapped runner and a `lastLog()` that names the file
 * the most recent call went to, for the journal line about it.
 */
export function loggedRunner(root, run, { role, model, effort, context }) {
  let last = null;
  const logDir = join(root, AGENT_LOG_DIR);
  const wrapped = async (prompt) => {
    const started = Date.now();
    try {
      const response = await run(prompt);
      last = appendRunLog(logDir, {
        role,
        model,
        effort,
        ok: true,
        prompt,
        response,
        durationMs: Date.now() - started,
        context: context(),
      });
      return response;
    } catch (error) {
      last = appendRunLog(logDir, {
        role,
        model,
        effort,
        ok: false,
        prompt,
        error: error.message,
        durationMs: Date.now() - started,
        context: context(),
      });
      throw error;
    }
  };
  return { run: wrapped, lastLog: () => (last ? basename(last) : null) };
}
