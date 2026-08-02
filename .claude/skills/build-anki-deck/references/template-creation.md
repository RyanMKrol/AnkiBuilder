# Creating a new reusable template

Template creation is orthogonal to deck building: a template is reusable English vocabulary +
categories, with no language baked in. When the user wants a new **reusable** template added to the
bundle (not a one-off word list — that's the **Lesson** or **EPUB** path instead), treat it as its
own small flow that completes *before* you return to the deck build:

1. **Confirm it's really a reusable template**, not a one-off deck. If they just want e.g. a numbers
   deck once, redirect to the **Lesson** path (dictate the words) — don't add a template.
2. **Gather the vocabulary, language-agnostically.** Ask for the English terms (dictated or pasted).
   **Do not ask what language it's for** — that's chosen later at build time. Group each term under a
   category from the enum in `src/model/categories.js` (`category` is validated against that fixed
   list — an unknown category fails schema validation; use `"Other"` if nothing fits).
3. **Author the files** (this is a codebase change, so do it on a branch per the repo conventions):
   - `templates/<name>.json` — `{ "meta": { "sourceType": "template" }, "items": [ { "id", "english",
     "category" }, ... ] }`. **No `targetLanguage`** in meta. `id`s are short kebab/snake handles
     unique within the file (e.g. `num_one`); `target`/`notes` are omitted (backfilled to `null` on
     load).
   - Register it in `AVAILABLE_TEMPLATES` in `src/corpus/templates.js` (`"<name>": "<name>.json"`).
   - Add a `test/corpus/templates.test.js` case (or extend the "every bundled template validates"
     loop) so the new template is schema-checked.
4. **Review the template with the user** before moving on — inspect the item list and confirm the
   terms and categories look right (a quick corpus-style review; you can `assemble --template <name>
   --lang <lang>` into a scratch run dir and open it in the dashboard (`npm run serve`) for the same
   corpus review the deck flow uses).
5. **Then hand off to the deck build**: with the new template committed and reviewed, proceed into
   Step 2 exactly as for any bundled template — ask the **Which target language?** question from
   Step 1 and run `assemble --template <name> --lang <lang>`.
