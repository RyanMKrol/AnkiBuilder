import { spawnSync } from "child_process";

/**
 * Default runner: invokes the local `claude -p` CLI with the given prompt and
 * returns its stdout. Injected as `runClaude` in tests so no real binary runs.
 */
export function runClaude(prompt) {
  const result = spawnSync("claude", ["-p", prompt], {
    encoding: "utf-8",
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`claude -p exited with status ${result.status}: ${result.stderr}`);
  }

  return result.stdout;
}
