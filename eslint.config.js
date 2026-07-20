import js from "@eslint/js";

export default [
  { ignores: ["node_modules/", "dist/", "build/", ".harness/"] },
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
      },
    },
  },
];
