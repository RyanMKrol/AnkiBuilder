#!/usr/bin/env -S node --env-file-if-exists=.env

import { runCli } from "./index.js";

runCli(process.argv.slice(2)).catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
