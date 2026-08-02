#!/usr/bin/env node
// Push the on-disk corpus state into a running Anki collection via AnkiConnect — the programmatic
// replacement for manual .apkg drag-and-drop. Backs up every managed deck (with scheduling) + a
// note-type structure snapshot, force-syncs the note type to the code's canonical spec, then updates
// each note's fields in place by GUID (scheduling preserved) and adds any new cards. Deterministic and
// idempotent: run it twice and the second run is a no-op. See src/anki/deliver.js.
//
// Usage:
//   node --env-file=.env scripts/deliver-to-anki.mjs [--dry] [--no-sync] [type:id ...]
//     --dry           preview the plan; read-only, writes nothing (no backup, no sync)
//     --no-sync       don't sync with AnkiWeb before/after (default: sync both)
//     type:id         limit to specific decks, e.g. course:nihongo-101-course-n5
//                     book:japanese-for-busy-people-book-1-kana  (omit → every managed deck)
// Anki must be open with the AnkiConnect add-on. By default it syncs with AnkiWeb before (pull) and
// after (push) — a content-only delivery syncs with no prompt; a schema change (new field/template)
// still needs one manual "Upload to AnkiWeb" click. --env-file is only needed if you later add audio-
// bearing cards; the deliver itself makes no ElevenLabs calls.
import { createAnkiConnect } from "../src/anki/ankiConnect.js";
import { deliverToAnki } from "../src/anki/deliver.js";

const args = process.argv.slice(2);
const dry = args.includes("--dry");
const sync = !args.includes("--no-sync");
const selectorArgs = args.filter((a) => a !== "--dry" && a !== "--no-sync");
const selectors = selectorArgs.length
  ? selectorArgs.map((a) => {
      const [type, id] = a.split(":");
      if (!type || !id) {
        console.error(`bad selector "${a}" — expected type:id (e.g. course:my-course)`);
        process.exit(1);
      }
      return { type, id };
    })
  : "all";

const outputRoot = process.env.ANKI_BUILDER_OUTPUT_ROOT || "output";

const client = createAnkiConnect();

let report;
try {
  report = await deliverToAnki(outputRoot, selectors, {
    client,
    dry,
    sync,
    log: (m) => console.error(`  ${m}`),
  });
} catch (e) {
  console.error(`\ndeliver failed: ${e.message}`);
  process.exit(1);
}

// --- report ---
const line = (s = "") => console.log(s);
line(dry ? "\n=== DRY RUN (no changes written) ===" : "\n=== DELIVERED ===");
if (report.backupDir) line(`backup: ${report.backupDir} (${report.backedUp.length} deck(s))`);

for (const d of report.decks) {
  line(
    d.skipped
      ? `  skipped ${d.type}:${d.id} — ${d.skipped}`
      : `  deck ${d.type}:${d.id} (${d.title})`,
  );
}

if (report.structure.length) {
  line("\nnote type:");
  for (const s of report.structure) {
    const changes = [
      s.createModel && "created",
      s.addedFields.length && `+fields[${s.addedFields.join(",")}]`,
      s.templates && "templates",
      s.css && "css",
    ].filter(Boolean);
    line(`  ${s.model}: ${changes.length ? changes.join(", ") : "already current"}`);
  }
}

if (report.removedLegacyDecks?.length) {
  line(`\nswept ${report.removedLegacyDecks.length} empty legacy deck shell(s):`);
  for (const name of report.removedLegacyDecks) line(`  - ${name}`);
}

line("\ncontent:");
let ambiguousTotal = 0;
for (const c of report.content) {
  line(
    `  ${c.deck}: ${c.updated} updated, ${c.added} added, ${c.skipped} unchanged, ${c.tagged} tagged`,
  );
  for (const a of c.addedCards) line(`     + new: ${a.card} — "${a.english}"`);
  if (c.addedWithoutAudio) line(`     ⚠ ${c.addedWithoutAudio} new card(s) added without audio`);
  for (const a of c.ambiguous) line(`     ⚠ ambiguous (skipped): ${a.card} — "${a.english}"`);
  for (const o of c.orphaned) line(`     ⚠ orphaned in Anki (kept): ${o.card} (note ${o.noteId})`);
  ambiguousTotal += c.ambiguous.length;
}

// --- AnkiWeb sync ---
if (dry) {
  line(`\nsync: skipped (dry run)`);
  if (report.schemaChanged) {
    line(`  note: this delivery changes the note-type schema — the real run's sync will need a`);
    line(`  one-time manual "Upload to AnkiWeb" click in Anki (schema changes force a full sync).`);
  }
} else if (!sync) {
  line(`\nsync: skipped (--no-sync) — sync manually in Anki when ready`);
} else {
  const s = (v) => (v === true ? "ok" : v === false ? "FAILED" : "skipped");
  line(`\nsync: before=${s(report.syncedBefore)}, after=${s(report.syncedAfter)}`);
  if (report.syncError) line(`  ⚠ ${report.syncError}`);
  if (report.schemaChanged) {
    line(
      `  ⚠ schema changed (new field/template) — Anki needs a one-time manual "Upload to AnkiWeb"`,
    );
    line(`     click to finish the full sync. Future content-only deliveries sync automatically.`);
  }
}
line();

// Ambiguous cards' edits never land until a human resolves them — an exit-0 run buried that in the
// scroll, so those cards silently drifted from the on-disk state forever. Fail the run instead.
if (ambiguousTotal > 0) {
  console.error(
    `deliver finished with ${ambiguousTotal} ambiguous card(s) skipped — resolve them (see ⚠ lines ` +
      `above) and re-run; until then those cards' edits are NOT in Anki.`,
  );
  process.exit(2);
}
