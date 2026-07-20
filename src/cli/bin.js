#!/usr/bin/env -S node --env-file-if-exists=.env

// Silence Node's ExperimentalWarning (e.g. the noisy `node:sqlite` "SQLite is an experimental
// feature" + "Use `node --trace-warnings`" hint) before the module graph that pulls in node:sqlite
// loads. This is why runCli is imported dynamically below: the wrapper must be installed BEFORE
// ./index.js (and its transitive node:sqlite import) is evaluated, or the warning has already fired.
const originalEmitWarning = process.emitWarning;
process.emitWarning = function (warning, ...rest) {
  const type = typeof rest[0] === "string" ? rest[0] : rest[0] && rest[0].type;
  if (type === "ExperimentalWarning" || (warning && warning.name === "ExperimentalWarning")) return;
  return originalEmitWarning.call(process, warning, ...rest);
};

const { runCli } = await import("./index.js");

runCli(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
