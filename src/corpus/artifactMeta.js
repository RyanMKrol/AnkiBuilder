import { createHash } from "crypto";
import { existsSync, readFileSync } from "fs";
import { relative, resolve } from "path";
import { writeFileAtomic } from "../util/atomicWrite.js";
import { resolvePinning } from "../util/runClaude.js";

// A cached LLM artifact (conventions.md, taught-index.json) is produced once per book by a paid
// pass and then silently outranks every later prompt edit. That is not hypothetical: this book's
// conventions.md (14 Jul) told the extraction pass to skip a paradigm image as exercise material,
// while the extraction prompt (9 Aug) used that exact shape as its worked example of "extract in
// full", and the chapter shipped none of those eight forms. Nothing recorded that the artifact was
// older than the rule it was competing with.
//
// So every cached artifact gets a sibling `<artifact>.meta.json` saying which prompt produced it,
// which model and effort ran it, when, and over how many chapters. At load time a mismatch is a
// WARNING and nothing more. Regenerating is a paid pass and a judgement call, so it stays a human
// decision; the only thing being fixed here is that the decision was invisible.
//
// WHAT IS HASHED is the prompt TEMPLATE FILE, not the rendered prompt. The rendered prompt embeds
// absolute chapter paths from the machine that ran it, so hashing it would report drift every time
// the checkout moved. The template is the thing a human edits, and a template edit is the drift
// worth knowing about.

export function metaPathFor(artifactPath) {
  return `${artifactPath}.meta.json`;
}

export function hashPromptTemplate(templatePath) {
  return createHash("sha256").update(readFileSync(templatePath)).digest("hex");
}

/**
 * The provenance record for an artifact about to be cached. `scopeEnvPrefix` and `defaults` are
 * the same ones the pass's own runner uses (src/corpus/epubLlmRunClaude.js), so the recorded
 * model and effort are what actually ran rather than the pipeline-wide default.
 */
export function buildArtifactMeta({
  templatePath,
  scopeEnvPrefix,
  defaults,
  chapterCount,
  now = new Date(),
}) {
  const { model, effort } = resolvePinning(scopeEnvPrefix, defaults);
  const repoRelative = relative(resolve(process.cwd()), resolve(templatePath));
  return {
    promptPath: repoRelative.startsWith("..") ? resolve(templatePath) : repoRelative,
    promptSha256: hashPromptTemplate(templatePath),
    model,
    effort,
    chapterCount: chapterCount ?? null,
    generatedAt: now.toISOString(),
  };
}

export function writeArtifactMeta(artifactPath, meta) {
  const path = metaPathFor(artifactPath);
  writeFileAtomic(path, JSON.stringify(meta, null, 2) + "\n");
  return path;
}

export function readArtifactMeta(artifactPath) {
  const path = metaPathFor(artifactPath);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

/**
 * One line naming the drift between a cached artifact and the prompt as it stands now, or null
 * when there is nothing to say. Never throws, never regenerates anything: a caller that cannot
 * find the artifact or the template gets null and carries on.
 *
 * `label` names the artifact in the message ("book conventions", "taught index").
 */
export function promptDriftWarning(artifactPath, templatePath, { label = "cached artifact" } = {}) {
  if (!existsSync(artifactPath)) return null;
  if (!existsSync(templatePath)) return null;

  const meta = readArtifactMeta(artifactPath);
  if (!meta) {
    return (
      `${label}: cached with no provenance record, so there is no way to tell which version of ` +
      `${templatePath} produced it. Treat its claims as possibly older than the prompt. ` +
      `Delete the artifact to have the next assemble rebuild it (a paid pass).`
    );
  }

  const current = hashPromptTemplate(templatePath);
  if (current === meta.promptSha256) return null;

  return (
    `${label}: generated ${meta.generatedAt} from a DIFFERENT version of ${meta.promptPath} ` +
    `(recorded ${meta.promptSha256.slice(0, 12)}, current ${current.slice(0, 12)}). The prompt has ` +
    `been edited since; the cached artifact has not. Nothing is regenerated automatically — that is ` +
    `a paid pass and a judgement call. Delete the artifact if you want it rebuilt.`
  );
}
