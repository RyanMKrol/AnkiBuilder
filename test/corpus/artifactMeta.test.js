import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import {
  buildArtifactMeta,
  hashPromptTemplate,
  metaPathFor,
  promptDriftWarning,
  readArtifactMeta,
  writeArtifactMeta,
} from "../../src/corpus/artifactMeta.js";

function withTempDir(fn) {
  const dir = mkdtempSync(join(tmpdir(), "artifact-meta-"));
  try {
    return fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("buildArtifactMeta records the prompt, its hash, the model and the time", () => {
  withTempDir((dir) => {
    const templatePath = join(dir, "prompt.md");
    writeFileSync(templatePath, "# a prompt\n");

    const meta = buildArtifactMeta({
      templatePath,
      scopeEnvPrefix: "ANKI_BUILDER_EPUB_LLM",
      chapterCount: 7,
      now: new Date("2026-08-14T10:00:00Z"),
    });

    assert.equal(meta.promptSha256, hashPromptTemplate(templatePath));
    assert.equal(meta.chapterCount, 7);
    assert.equal(meta.generatedAt, "2026-08-14T10:00:00.000Z");
    assert.ok(meta.model, "the model that would run this pass is recorded");
    assert.ok(meta.effort);
  });
});

test("the meta is written to an <artifact>.meta.json sibling and reads back", () => {
  withTempDir((dir) => {
    const artifact = join(dir, "conventions.md");
    writeFileSync(artifact, "# conventions\n");
    const templatePath = join(dir, "prompt.md");
    writeFileSync(templatePath, "# a prompt\n");

    const meta = buildArtifactMeta({ templatePath, chapterCount: 1 });
    const written = writeArtifactMeta(artifact, meta);

    assert.equal(written, metaPathFor(artifact));
    assert.ok(existsSync(written));
    assert.deepEqual(readArtifactMeta(artifact), meta);
    assert.match(readFileSync(written, "utf-8"), /\n$/, "trailing newline like every other write");
  });
});

// The point of the whole mechanism: the artifact is old, the prompt has moved on, and until now
// nothing said so.
test("promptDriftWarning names the drift when the prompt has been edited since", () => {
  withTempDir((dir) => {
    const artifact = join(dir, "conventions.md");
    writeFileSync(artifact, "# conventions\n");
    const templatePath = join(dir, "prompt.md");
    writeFileSync(templatePath, "# a prompt\n");
    writeArtifactMeta(artifact, buildArtifactMeta({ templatePath, chapterCount: 1 }));

    assert.equal(promptDriftWarning(artifact, templatePath), null, "unchanged prompt is silent");

    writeFileSync(templatePath, "# a prompt, edited a month later\n");
    const warning = promptDriftWarning(artifact, templatePath, { label: "book conventions" });

    assert.match(warning, /book conventions/);
    assert.match(warning, /DIFFERENT version/);
    assert.match(warning, /Nothing is regenerated automatically/);
  });
});

test("an artifact cached before provenance existed says so rather than staying silent", () => {
  withTempDir((dir) => {
    const artifact = join(dir, "conventions.md");
    writeFileSync(artifact, "# conventions\n");
    const templatePath = join(dir, "prompt.md");
    writeFileSync(templatePath, "# a prompt\n");

    const warning = promptDriftWarning(artifact, templatePath, { label: "book conventions" });
    assert.match(warning, /no provenance record/);
  });
});

test("no artifact and no template mean nothing to warn about", () => {
  withTempDir((dir) => {
    const templatePath = join(dir, "prompt.md");
    writeFileSync(templatePath, "# a prompt\n");

    assert.equal(promptDriftWarning(join(dir, "missing.md"), templatePath), null);
    assert.equal(promptDriftWarning(templatePath, join(dir, "missing-prompt.md")), null);
  });
});

test("a corrupt meta file reads as absent rather than throwing", () => {
  withTempDir((dir) => {
    const artifact = join(dir, "conventions.md");
    writeFileSync(artifact, "# conventions\n");
    writeFileSync(metaPathFor(artifact), "{not json");

    assert.equal(readArtifactMeta(artifact), null);
  });
});
