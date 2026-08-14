import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { MARK_DONE_SCRIPT } from "../../src/review/clientScripts.js";
import { rebuildGroupQuiet } from "../../src/server/rebuildSignal.js";

/**
 * `src/review/clientScripts.js` is 650 lines of browser code with no tests, and it renders the one
 * string both human gates depend on: the " — but deck rebuild FAILED" message that tells a reviewer
 * their Mark done landed but the shipping `.apkg` did not. Preflight's package-freshness check now
 * catches the same staleness after the fact; this is the in-band signal at the moment it happens,
 * and losing it silently would mean a reviewer walks away believing the deck is current.
 *
 * These two tests pin the string and the branch that produces it. They are deliberately cheap: the
 * script is a template literal, so asserting on its source is asserting on what the browser gets.
 */

test("the Mark-done script keeps the rebuild-FAILED branch a reviewer's gate depends on", () => {
  assert.match(MARK_DONE_SCRIPT, /x\.j\.rebuildError/);
  assert.match(MARK_DONE_SCRIPT, / — but deck rebuild FAILED: /);
  // On a rebuild failure the page must NOT reload: the reload would wipe the message and the stale
  // package would go unnoticed, which is the exact failure the message exists to prevent.
  const branch = MARK_DONE_SCRIPT.slice(
    MARK_DONE_SCRIPT.indexOf("if (x.j.rebuildError)"),
    MARK_DONE_SCRIPT.indexOf("if (msg) msg.textContent = okText;"),
  );
  assert.ok(!branch.includes("location.reload"), "the failure branch stays on the page");
  assert.match(branch, /btn\.disabled = false/, "the button is re-enabled so it can be retried");
});

test("the script is plain text with no template interpolation left in it", () => {
  // These strings are embedded verbatim into a page built with template literals, so a stray `${`
  // would be evaluated at render time against the server's scope rather than reaching the browser.
  assert.ok(!MARK_DONE_SCRIPT.includes("${"), "no ${} may survive into a client script");
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "rebuild-signal-"));
  mkdirSync(join(root, "epubs", "mybook"), { recursive: true });
  writeFileSync(
    join(root, "epubs", "mybook", "book.json"),
    JSON.stringify({ title: "My Book", targetLanguage: "ja" }),
  );
  return { root, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

test("rebuildGroupQuiet swallows only the BENIGN cases, and surfaces everything else", async () => {
  const { root, cleanup } = fixture();
  try {
    const benign = [
      "no finished lessons to build under /x",
      "no chapter-*/ or lesson-*/ directories found under /x",
      "no directories found",
    ];
    for (const message of benign) {
      const adapter = {
        rebuild: async () => {
          throw new Error(message);
        },
      };
      const out = await rebuildGroupQuiet(root, adapter, "mybook");
      assert.equal(out.rebuildError, null, `"${message}" is benign`);
    }

    // Anything else is a real build failure the reviewer has to see. It used to be swallowed here,
    // so Mark done reported success while the shipping .apkg silently stayed stale.
    const adapter = {
      rebuild: async () => {
        throw new Error("EACCES: permission denied, open '/output/mybook/mybook.apkg'");
      },
    };
    const out = await rebuildGroupQuiet(root, adapter, "mybook");
    assert.match(out.rebuildError, /EACCES/);
  } finally {
    cleanup();
  }
});
