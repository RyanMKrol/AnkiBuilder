// The `translate` command: corpus.json to cards.json, with retry of previously
// errored items. `prepare` calls runTranslateInner as its first step.
// Moved verbatim from src/cli/index.js when the CLI was split per command.
import { existsSync } from "fs";
import { withClaim } from "../runClaim.js";
import { readJson, writeJson } from "./shared.js";

export async function runTranslate(flags, ctx) {
  if (!flags.run) {
    throw new Error("--run <dir> is required");
  }
  return withClaim(flags.run, { stage: "translate" }, () => runTranslateInner(flags, ctx));
}

export async function runTranslateInner(flags, ctx) {
  const paths = ctx.runPaths(flags.run);

  if (existsSync(paths.cards)) {
    const existing = readJson(paths.cards);
    const pending = Array.isArray(existing.meta?.translateErrors)
      ? existing.meta.translateErrors
      : [];
    if (pending.length === 0) {
      ctx.log(`cards.json already exists at ${paths.cards} — reusing`);
      return;
    }
    // A previous run left errored items behind. Without this, "cards.json already exists" froze
    // the failure in permanently — every re-run short-circuited and the missing cards never came
    // back. Retry JUST the errored subset and merge the successes in at their corpus positions.
    ctx.log(
      `translate: retrying ${pending.length} item(s) that failed last time: ` +
        pending.map((e) => e.id).join(", "),
    );
    const corpus = readJson(paths.corpus);
    const pendingIds = new Set(pending.map((e) => e.id));
    const subCorpus = { ...corpus, items: corpus.items.filter((item) => pendingIds.has(item.id)) };
    const { cards: retried, errors } = await ctx.translateCorpus(subCorpus, {
      simpleScript: !!flags["simple-script"],
    });

    const byId = new Map(existing.items.map((item) => [item.id, item]));
    for (const item of retried.items) {
      byId.set(item.id, item);
    }
    const orderById = new Map(corpus.items.map((item, index) => [item.id, index]));
    existing.items = [...byId.values()].sort(
      (a, b) =>
        (orderById.get(a.id) ?? Number.MAX_SAFE_INTEGER) -
        (orderById.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    );
    existing.meta = { ...existing.meta };
    if (errors.length > 0) {
      existing.meta.translateErrors = errors;
    } else {
      delete existing.meta.translateErrors;
    }
    writeJson(paths.cards, existing);
    ctx.log(
      errors.length > 0
        ? `translate: ${errors.length} item(s) STILL failing — the lesson stays blocked from review: ` +
            errors.map((e) => e.id).join(", ")
        : `translate: recovered all ${retried.items.length} previously-failed item(s)`,
    );
    return;
  }

  if (!existsSync(paths.corpus)) {
    throw new Error(`corpus.json not found at ${paths.corpus} — run "assemble" first`);
  }

  const corpus = readJson(paths.corpus);

  // No review gate here: translation runs right after assemble so the FIRST human review (the combined
  // Corpus review in the dashboard) can show English + target + pronunciation together. The review gate
  // moved one step later — `audio` refuses to run until that Corpus review is signed off (see runAudio).

  // `--simple-script` asks the language plug-in (src/translate/targetScript.js) to constrain the
  // generated target to the language's beginner/learner script (e.g. Japanese → kana only). No-op for
  // a language with no such rule.
  const { cards, errors } = await ctx.translateCorpus(corpus, {
    simpleScript: !!flags["simple-script"],
  });

  // Errored items are RECORDED on the file, not just logged: readiness blocks the review while any
  // are present, and the re-run path above retries exactly this subset instead of short-circuiting.
  if (errors.length > 0) {
    cards.meta = { ...cards.meta, translateErrors: errors };
  }

  // For a source whose targets are GENERATED (template / dictated lesson), the assemble-time
  // pedagogical sort could only see English — the targets were still null. Re-sort now that the
  // real sentences exist, so atoms-before-molecules is judged on the target text. EPUB corpora
  // carried their targets at assemble time and keep that order. Fail-open like the original sort.
  if (!flags["no-sort"] && corpus.meta.sourceType !== "epub" && errors.length === 0) {
    const sortResult = ctx.sortItemsPedagogically({
      items: cards.items,
      targetLanguage: corpus.meta.targetLanguage,
      log: ctx.log,
    });
    cards.items = sortResult.items;
    if (sortResult.changed) {
      ctx.log("pedagogical sort: re-ordered the translated cards now that targets exist");
    }
  }

  writeJson(paths.cards, cards);
  ctx.log(`translated ${cards.items.length} item(s) to ${paths.cards}`);
  // Translation alone does NOT make a lesson reviewable — the drill, de-dup and cross-reference
  // passes all still have to run, and the dashboard holds the lesson back until they have. Say so
  // here rather than leaving someone to wonder why the review offers no sign-off button.
  if (!flags.__fromPrepare) {
    ctx.log(
      `translate: this lesson is NOT reviewable yet — run "prepare --run ${flags.run}" to finish it ` +
        `(prepare runs translate itself, so it is the normal way in).`,
    );
  }
  if (errors.length > 0) {
    ctx.log(
      `${errors.length} item(s) failed to translate (after one retry): ` +
        `${errors.map((e) => e.id).join(", ")} — recorded in cards.json; re-run to retry them`,
    );
  }
}
