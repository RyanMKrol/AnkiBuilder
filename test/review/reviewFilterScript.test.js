import test from "node:test";
import assert from "node:assert/strict";
import { REVIEW_FILTER_SCRIPT } from "../../src/review/clientScripts.js";

// Runs the SHIPPED client script against a minimal fake DOM, rather than re-stating its predicate in
// the test. The review table's book-order sort passed its unit test for a whole day while never
// working in a browser, because the test exercised a function the page did not actually receive data
// for. This executes the exact string the page loads.

function classList() {
  const set = new Set();
  return {
    add: (c) => set.add(c),
    remove: (c) => set.delete(c),
    contains: (c) => set.has(c),
    toggle: (c, force) => {
      const on = force === undefined ? !set.has(c) : force;
      if (on) set.add(c);
      else set.delete(c);
      return on;
    },
  };
}

function el(attrs = {}) {
  const handlers = {};
  return {
    attrs,
    hidden: false,
    open: false,
    textContent: "",
    classList: classList(),
    getAttribute: (k) => (k in attrs ? attrs[k] : null),
    addEventListener: (ev, fn) => (handlers[ev] = fn),
    click: () => handlers.click && handlers.click(),
    querySelector: () => null,
  };
}

/** Builds a page: chips from `chipSpecs`, rows from `rowTokens`, all in one section. */
function page(chipSpecs, rowTokens) {
  const chips = chipSpecs.map((spec) =>
    el({
      "data-filter": spec.key,
      ...(spec.scope ? { "data-scope": "1" } : {}),
      ...(spec.excludes ? { "data-excludes": spec.excludes } : {}),
    }),
  );
  const rows = rowTokens.map((toks) => el({ "data-f": toks }));
  const bar = el();
  bar.querySelectorAll = () => chips;
  const clear = el();
  const count = el();
  const section = el();
  section.querySelector = () => rows.find((r) => !r.hidden) ?? null;
  const document = {
    getElementById: (id) => ({ fbar: bar, fclear: clear, fcount: count })[id] ?? null,
    querySelectorAll: (sel) => (sel.startsWith("tr.row") ? rows : [section]),
  };
  new Function("document", REVIEW_FILTER_SCRIPT)(document);
  const chip = (k) => chips.find((c) => c.attrs["data-filter"] === k);
  const visible = () => rows.map((r, i) => (r.hidden ? null : i)).filter((i) => i !== null);
  return { chip, visible, clear, count, rows };
}

const SPECS = [
  { key: "shipping", scope: true, excludes: "excluded script-excluded" },
  { key: "excluded" },
  { key: "script-excluded" },
  { key: "uncertain" },
  { key: "ai" },
];

// row 0: shipping, uncertain
// row 1: shipping
// row 2: excluded by a script, uncertain
// row 3: excluded by a human
// row 4: shipping, ai
const ROWS = [
  "shipping uncertain",
  "shipping",
  "excluded script-excluded uncertain",
  "excluded",
  "shipping ai",
];

test("with nothing selected, every row shows", () => {
  const p = page(SPECS, ROWS);
  assert.deepEqual(p.visible(), [0, 1, 2, 3, 4]);
});

test("Not excluded alone shows exactly the shipping cards", () => {
  const p = page(SPECS, ROWS);
  p.chip("shipping").click();
  assert.deepEqual(p.visible(), [0, 1, 4]);
});

test("Not excluded NARROWS a flag: shipping AND uncertain, not shipping OR uncertain", () => {
  // The whole reason it is a scope. Unioned, this would also show row 2, an excluded uncertain card
  //which is precisely what choosing "Not excluded" asked to hide.
  const p = page(SPECS, ROWS);
  p.chip("shipping").click();
  p.chip("uncertain").click();
  assert.deepEqual(p.visible(), [0]);
});

test("flags still WIDEN each other: uncertain OR ai", () => {
  const p = page(SPECS, ROWS);
  p.chip("uncertain").click();
  p.chip("ai").click();
  assert.deepEqual(p.visible(), [0, 2, 4]);
});

test("a scope with two flags narrows the union of the flags", () => {
  const p = page(SPECS, ROWS);
  p.chip("shipping").click();
  p.chip("uncertain").click();
  p.chip("ai").click();
  assert.deepEqual(p.visible(), [0, 4]);
});

test("turning on Not excluded switches off Excluded, rather than emptying the table", () => {
  const p = page(SPECS, ROWS);
  p.chip("excluded").click();
  p.chip("shipping").click();
  assert.equal(p.chip("excluded").classList.contains("on"), false);
  assert.deepEqual(p.visible(), [0, 1, 4]);
});

test("turning on Excluded switches off Not excluded, in the other direction too", () => {
  const p = page(SPECS, ROWS);
  p.chip("shipping").click();
  p.chip("script-excluded").click();
  assert.equal(p.chip("shipping").classList.contains("on"), false);
  assert.deepEqual(p.visible(), [2]);
});

test("All clears every chip and shows every row", () => {
  const p = page(SPECS, ROWS);
  p.chip("shipping").click();
  p.chip("uncertain").click();
  p.clear.click();
  assert.deepEqual(p.visible(), [0, 1, 2, 3, 4]);
});

test("the count line reports what is shown out of the whole table", () => {
  const p = page(SPECS, ROWS);
  p.chip("shipping").click();
  assert.equal(p.count.textContent, "3 of 5 shown");
});
