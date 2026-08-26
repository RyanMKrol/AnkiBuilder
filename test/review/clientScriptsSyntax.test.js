import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import * as scripts from "../../src/review/clientScripts.js";

/**
 * Every client script must PARSE.
 *
 * These are JavaScript stored inside JS template literals and inlined into a page as one `<script>`,
 * so an escape that survives the template literal is a syntax error in the browser, and one syntax
 * error anywhere kills EVERY handler on the page, silently. A button that does nothing is the only
 * symptom.
 *
 * That happened: `"\n\n"` written in the source was consumed by the template literal into a real
 * newline inside a string literal, which took out approve, exclude, inline edit, the trim editor and
 * the sticky header all at once. Nothing else in the suite could see it, because every other test
 * asserts on the HTML around the script rather than on the script itself.
 */
const SCRIPTS = Object.entries(scripts).filter(([, v]) => typeof v === "string");

test("every exported client script is syntactically valid JavaScript", () => {
  assert.ok(SCRIPTS.length >= 8, "found the script constants");
  for (const [name, source] of SCRIPTS) {
    assert.doesNotThrow(
      () => new vm.Script(source, { filename: `${name}.js` }),
      `${name} must parse`,
    );
  }
});

test("the whole set concatenated parses, which is how a page actually serves them", () => {
  // A page joins several of these into ONE script tag, so a stray unclosed brace in an early one
  // breaks the later ones rather than itself.
  const joined = SCRIPTS.map(([, s]) => s).join("\n");
  assert.doesNotThrow(() => new vm.Script(joined, { filename: "page.js" }));
});
