import { readFileSync } from "fs";
import { writeFileAtomic } from "../util/atomicWrite.js";

/**
 * Runs one eval fixture and returns its human-readable report.
 *
 * The replay seam is `runClaude` itself, and the recorded artifact is the model's RAW stdout — not
 * the parsed result. That choice is what makes the no-spawn mode worth having: replaying raw stdout
 * still runs the pass's own fence-stripping, JSON parsing, schema validation and merge logic, so the
 * offline run exercises everything except the network. Recording parsed items would have skipped
 * exactly the code most likely to break.
 *
 * Modes:
 *   "recorded" (default) — serve the stored responses in order. Spends nothing, needs no network,
 *                          and is the only mode CI ever uses.
 *   "live"               — call the real `claude -p` through the pass's own runner, capturing each
 *                          response so `--save` can write a new recording.
 *
 * A fixture that asks for more responses than the recording holds throws rather than serving
 * `undefined`: a short recording means the pass now makes more calls than it did, which is a real
 * change and must not read as a quiet zero-diff.
 */
export function runFixture(fixture, { mode = "recorded", recording, liveRunClaude } = {}) {
  const availability = fixture.available();
  if (!availability.ok) {
    throw new Error(`fixture "${fixture.name}" cannot run: ${availability.reason}`);
  }

  const responses = [];
  const runClaude =
    mode === "live"
      ? (prompt) => {
          const raw = liveRunClaude(prompt);
          responses.push(raw);
          return raw;
        }
      : replayRunner(fixture.name, recording);

  const started = Date.now();
  const result = fixture.run({ runClaude });
  const elapsedMs = Date.now() - started;

  return {
    fixture,
    mode,
    elapsedMs,
    responses: mode === "live" ? responses : recording.responses,
    candidate: result.candidate,
    report: result.report,
  };
}

function replayRunner(name, recording) {
  if (!recording || !Array.isArray(recording.responses)) {
    throw new Error(
      `no recorded responses for fixture "${name}" — run it once with --live --save to make one`,
    );
  }
  let cursor = 0;
  return () => {
    if (cursor >= recording.responses.length) {
      throw new Error(
        `fixture "${name}" asked for model call ${cursor + 1} but the recording holds only ` +
          `${recording.responses.length} — the pass now makes more calls than when it was recorded; ` +
          `re-record with --live --save`,
      );
    }
    return recording.responses[cursor++];
  };
}

export function readRecording(path) {
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function writeRecording(path, { fixture, responses }) {
  writeFileAtomic(
    path,
    JSON.stringify(
      {
        fixture: fixture.name,
        pass: fixture.pass,
        recordedAt: new Date().toISOString(),
        responses,
      },
      null,
      2,
    ) + "\n",
  );
  return path;
}
