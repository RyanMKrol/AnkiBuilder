// Invoking one pinned agent role.
//
// Every v2 role goes through here rather than calling `runClaudeWithPrompt` directly, for the same
// reason `unitDeckSegments` is the one place a deck name is derived: two call sites that each build
// their own pinning will eventually disagree, and the disagreement is invisible until a role runs on
// the wrong model and the only evidence is a bill.
//
// `runClaude` is injectable so tests never spawn a model. That is the v1 idiom (every pass takes its
// runner) and it is what lets an agent be built and asserted for free, with running it live against
// a real chapter a separate and deliberate act.

import { runClaudeWithPrompt } from "../util/runClaude.js";
import { ROLES } from "./roles.js";
import { appendRunLog, currentRunLogDir } from "./runLog.js";

const MAX_BUFFER = 20 * 1024 * 1024;

/**
 * Runs `prompt` as `roleId`, at that role's declared model, effort and timeout.
 *
 * The env scope is the role's own, so `ANKI_BUILDER_<SCOPE>_MODEL` moves one role and nothing else.
 * There is no family fallback: the v1 families (`ANKI_BUILDER_EPUB_LLM`, `ANKI_BUILDER_TRANSLATE`)
 * group passes that share a blast radius, and v2's roles do not share one — the coverage adversary
 * and the table specialist are pinned apart on purpose, so a single knob that moved both would undo
 * the ranking the role registry asserts.
 */
export function runRole(roleId, prompt, { runClaude = runClaudeWithPrompt, logDir = null } = {}) {
  const role = ROLES[roleId];
  if (!role) throw new Error(`unknown agent role: ${roleId}`);
  const target = logDir ?? currentRunLogDir();
  const started = Date.now();
  const tee = (ok, { response = null, error = null }) => {
    // Logging must never be able to fail a run that otherwise succeeded: an unwritable directory is
    // a worse reason to lose a paid response than no logging at all.
    try {
      appendRunLog(target, {
        role: roleId,
        model: role.model,
        effort: role.effort,
        ok,
        durationMs: Date.now() - started,
        prompt,
        response,
        error,
      });
    } catch {
      /* ignore */
    }
  };

  let response;
  try {
    response = runClaude(prompt, {
      scopeEnvPrefix: [`ANKI_BUILDER_${role.envScope}`],
      defaults: { model: role.model, effort: role.effort, timeoutMs: role.timeoutMs },
      maxBuffer: MAX_BUFFER,
    });
  } catch (error) {
    // The call itself failed. Written before the rethrow for the same reason the parse guards below
    // it now have evidence at all: the thing that failed is the thing worth reading.
    tee(false, { error: error?.message ?? String(error) });
    throw error;
  }
  tee(true, { response });
  return response;
}
