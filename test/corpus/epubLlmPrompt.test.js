import test from "node:test";
import assert from "node:assert";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { renderExtractionPrompt } from "../../src/corpus/epubLlmPrompt.js";

function withTempTemplate(content, fn) {
  const dir = mkdtempSync(join(tmpdir(), "epub-llm-prompt-"));
  const templatePath = join(dir, "template.md");
  writeFileSync(templatePath, content);
  try {
    return fn(templatePath);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("renderExtractionPrompt() substitutes TARGET_LANGUAGE and CHAPTER_FILE_PATH", () => {
  withTempTemplate("Target: {{TARGET_LANGUAGE}}\nFile: {{CHAPTER_FILE_PATH}}\n", (templatePath) => {
    const rendered = renderExtractionPrompt({
      targetLanguage: "Spanish",
      chapterFilePath: "/tmp/chapter.xhtml",
      templatePath,
    });

    assert.match(rendered, /Target: Spanish/);
    assert.match(rendered, /File: \/tmp\/chapter\.xhtml/);
  });
});

test("renderExtractionPrompt() substitutes repeated placeholders everywhere they appear", () => {
  withTempTemplate("{{TARGET_LANGUAGE}} once, {{TARGET_LANGUAGE}} twice", (templatePath) => {
    const rendered = renderExtractionPrompt({
      targetLanguage: "French",
      chapterFilePath: "/tmp/chapter.xhtml",
      templatePath,
    });

    assert.strictEqual(rendered, "French once, French twice");
  });
});

test("renderExtractionPrompt() resolves a relative chapterFilePath to an absolute path", () => {
  withTempTemplate("{{CHAPTER_FILE_PATH}}", (templatePath) => {
    const rendered = renderExtractionPrompt({
      targetLanguage: "Spanish",
      chapterFilePath: "relative/chapter.xhtml",
      templatePath,
    });

    assert.ok(rendered.startsWith("/"), "expected an absolute path in the rendered prompt");
    assert.match(rendered, /relative\/chapter\.xhtml$/);
  });
});

test("renderExtractionPrompt() requires targetLanguage", () => {
  assert.throws(() => {
    renderExtractionPrompt({ chapterFilePath: "/tmp/chapter.xhtml" });
  }, /targetLanguage is required/);
});

test("renderExtractionPrompt() requires chapterFilePath", () => {
  assert.throws(() => {
    renderExtractionPrompt({ targetLanguage: "Spanish" });
  }, /chapterFilePath is required/);
});

test("renderExtractionPrompt() throws if the template has an unresolved placeholder", () => {
  withTempTemplate("{{TARGET_LANGUAGE}} and {{SOMETHING_ELSE}}", (templatePath) => {
    assert.throws(() => {
      renderExtractionPrompt({
        targetLanguage: "Spanish",
        chapterFilePath: "/tmp/chapter.xhtml",
        templatePath,
      });
    }, /unresolved placeholder: \{\{SOMETHING_ELSE\}\}/);
  });
});

test("renderExtractionPrompt() defaults to the real docs/epub-extraction-prompt.md template", () => {
  const rendered = renderExtractionPrompt({
    targetLanguage: "Japanese",
    chapterFilePath: "/tmp/chapter.xhtml",
  });

  assert.match(rendered, /Japanese-language textbook/);
  assert.match(rendered, /\/tmp\/chapter\.xhtml/);
  assert.doesNotMatch(rendered, /\{\{[A-Z_]+\}\}/);
});
