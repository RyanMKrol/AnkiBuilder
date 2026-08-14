import { defineCheck } from "../registry.js";

/**
 * TEMPLATE-PATH PARITY.
 *
 * The bundled-template path (`output/templates/<name>/<lang>`) is alive: `templates/*.json` ships
 * two of them, `resolveTemplateRunDir` allocates the folder, `templateAdapter` renders it in the
 * dashboard and `rebuildRunDir` packages it. What it did NOT have was any deterministic gate —
 * preflight's unit regex could not match a template folder, so a template deck was skipped in
 * silence and the run still printed "preflight clean".
 *
 * Bringing it to parity is mostly free (the shared loader now knows the shape, so every
 * collection-scope check runs against it). The part that is not free is the EXEMPTIONS: a template
 * legitimately skips two of the pre-review passes, and "legitimately skips" and "silently missing"
 * look identical on disk. So the exemption is reported as a decision, with its reason, on every
 * run — and the marker that grants it is itself checked.
 */

export const templateExemptionsCheck = defineCheck({
  id: "template-exemptions",
  title: "template exemptions",
  scope: "collection",
  tier: "INFO",
  appliesTo: (collection) => collection.kind === "template",
  run({ collection, units }) {
    const notes = [
      `${collection.slug} is a bundled-template deck: one unit per (template, language), packaged on its own`,
    ];
    for (const unit of units) {
      const meta = unit.meta ?? {};
      const exemptions = [];
      if (meta.sourceType === "template") {
        exemptions.push(
          "readiness: exempt (lessonReadiness returns ready for sourceType=template)",
          "enriched (fill-in-the-blank + semantic de-dup): not required — a fixed vocabulary list has no source drills to mine",
          "notesEnhanced (cross-lesson notes): not required — there are no sibling lessons to cross-reference",
        );
      }
      notes.push(
        `${unit.name}: ${unit.items.length} card(s); ` +
          (exemptions.length ? exemptions.join("; ") : "no exemptions claimed"),
      );
    }
    return { notes, summary: `${units.length} template unit(s), exemptions reported` };
  },
});

export const sourceTypeCheck = defineCheck({
  id: "source-type",
  title: "source type",
  scope: "unit",
  tier: "FAIL",
  /**
   * `sourceType: "template"` is a real exemption switch, not a label: `lessonReadiness` returns
   * ready unconditionally for it, so both pre-review passes are waived. Claimed by a unit that is
   * not a template, it silently waives them for a lesson that needed them, and the reviewer signs
   * off a card set the drill and cross-reference passes never touched — the exact failure
   * `lessonReadiness` was written to end. Missing from a unit that IS a template, the dashboard
   * holds the deck back forever waiting for passes that will never run.
   *
   * So the location and the marker have to agree, and this is the one line that says so.
   */
  run({ unit, collection }) {
    const declared = unit.meta?.sourceType;
    if (declared === undefined) return { summary: "no sourceType declared" };
    const isTemplateDir = collection.kind === "template";
    if (isTemplateDir && declared !== "template") {
      return {
        findings: [
          {
            key: "sourceType",
            message:
              `${unit.name} lives under templates/ but declares sourceType "${declared}". The ` +
              `dashboard will hold it back waiting for the enrichment passes a template never runs.`,
          },
        ],
      };
    }
    if (!isTemplateDir && declared === "template") {
      return {
        findings: [
          {
            key: "sourceType",
            message:
              `${unit.name} declares sourceType "template" but is not a template unit. That marker ` +
              `waives BOTH pre-review passes unconditionally, so this unit can be signed off ` +
              `without the drill and cross-lesson passes ever having run.`,
          },
        ],
      };
    }
    return { summary: `sourceType ${declared}` };
  },
});

export const unmatchedDirsCheck = defineCheck({
  id: "unmatched-dirs",
  title: "unrecognised dirs",
  scope: "collection",
  tier: "INFO",
  /**
   * A directory inside a collection that holds a cards.json or corpus.json but whose name matches
   * no known unit shape.
   *
   * Reported, not failed — the ruling on this was explicitly about ordering: a hard failure here
   * before the loader knew all three shapes would have given the first person to build a template
   * deck a red preflight for a perfectly legitimate layout, and taught them to override it. The
   * loader now knows all three, so the honest end state is a failure; it stays a report until a
   * fourth shape is either added deliberately or ruled out.
   */
  run({ collection }) {
    const dirs = collection.unmatchedDirs ?? [];
    return {
      notes: dirs.map((dir) => `${dir} holds unit files but matches no known unit shape`),
      summary: dirs.length ? `${dirs.length} unrecognised` : "every unit dir recognised",
    };
  },
});
