// The `serve` command. Moved verbatim from src/cli/index.js when the CLI was
// split per command.
import { resolve } from "path";

// Starts the local deck-dashboard web server: a browsable index of every built deck, each opening to a
// page of collapsible lessons with audio streamed over HTTP (no Artifact size cap, unlike view-deck).
// Long-running — the listening server keeps the process alive until Ctrl+C.
export async function runServe(flags, ctx) {
  const outputRoot = flags["output-root"] ? resolve(flags["output-root"]) : resolve("output");
  const port = flags.port ? Number(flags.port) : 4321;
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`--port must be a valid port number (got ${JSON.stringify(flags.port)})`);
  }
  const editable = !flags["read-only"];
  const { url } = await ctx.startDeckServer({
    port,
    outputRoot,
    editable,
    voice: flags.voice || null,
  });
  // Keep the URL as the LAST, most prominent thing printed — it's the one thing you need.
  ctx.log(
    `Serving decks from ${outputRoot}${editable ? "" : " (read-only)"}. Press Ctrl+C to stop.`,
  );
  const line = `  Dashboard  →  ${url}  `;
  const bar = "─".repeat(line.length);
  ctx.log("");
  ctx.log(`┌${bar}┐`);
  ctx.log(`│${line}│`);
  ctx.log(`└${bar}┘`);
  ctx.log("");
}
