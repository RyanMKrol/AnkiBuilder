import js from "@eslint/js";

export default [
  // `.claude/worktrees/` holds throwaway git worktrees an agent session checks out INSIDE this
  // checkout. They are full copies of the repo, so without this line `eslint .` lints every file in
  // the project once per live worktree, and reports errors in `.harness/` copies that the top-level
  // `.harness/` ignore was meant to exclude. The dir is excluded from git via `.git/info/exclude`,
  // which eslint does not read.
  { ignores: ["node_modules/", "dist/", "build/", ".harness/", ".claude/worktrees/"] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        process: "readonly",
        console: "readonly",
        URL: "readonly",
        fetch: "readonly",
        AbortSignal: "readonly",
        globalThis: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        queueMicrotask: "readonly",
      },
    },
  },
];
