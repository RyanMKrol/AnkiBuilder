import { spawnSync } from "child_process";
import { existsSync, mkdirSync } from "fs";
import { join } from "path";

// Puts a book's pictures back. The transcript describes each figure in words and, since the
// figure-box prompt change, says where it sits on the page (`data-box`, fractions of the page from
// its top-left corner). The build cuts each one out of the page image and places it in the figure,
// so the converted book carries real images and the pipeline's image passes have something to
// read, exactly as they would in a born-digital book.
//
// A model's box is approximate, so every crop is padded; a little surrounding page is cheaper than
// a clock with its numerals cut off. Cropping is macOS `sips` (no dependency), and a crop is made
// once and reused, since the page image and the box fully determine it.

const PAD = 0.015;

/** `[left, top, right, bottom]` as fractions, or null when the attribute is not a usable box. */
export function parseBox(value) {
  const parts = String(value).split(",").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) return null;
  const [left, top, right, bottom] = parts;
  if (left < 0 || top < 0 || right > 1 || bottom > 1 || right <= left || bottom <= top) return null;
  return parts;
}

/** The pixel rectangle to cut: the box, padded, clamped to the page. */
export function pixelRect(box, { width, height }, pad = PAD) {
  const [left, top, right, bottom] = box;
  const x0 = Math.max(0, Math.floor((left - pad) * width));
  const y0 = Math.max(0, Math.floor((top - pad) * height));
  const x1 = Math.min(width, Math.ceil((right + pad) * width));
  const y1 = Math.min(height, Math.ceil((bottom + pad) * height));
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function altText(figureInner) {
  const caption = /<figcaption>([\s\S]*?)<\/figcaption>/.exec(figureInner);
  return (caption ? caption[1] : "")
    .replace(/<[^>]+>/g, " ")
    .replace(/[[\]"<>&]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds every boxed figure in a page body and gives each an <img>. `crop(rect, destPath)` makes
 * the image file; it is injected so tests never run sips. Returns the new body and the images to
 * pack into the EPUB, as `{ name, path }` with `name` relative to the chapter file. A figure whose
 * box is missing or unusable keeps its caption and gets no image, and is counted in `skipped`.
 */
export function attachFigureImages(body, { pageNumber, stem, cropsDir, pageSize, crop }) {
  const images = [];
  let skipped = 0;
  let index = 0;
  const out = body.replace(/<figure\b[^>]*>[\s\S]*?<\/figure>/g, (figure) => {
    const match = /\bdata-box="([^"]*)"/.exec(figure);
    const box = match && parseBox(match[1]);
    if (!box) {
      skipped++;
      return figure;
    }
    index++;
    const file = `${stem(pageNumber)}-fig-${index}.jpg`;
    const destPath = join(cropsDir, file);
    if (!existsSync(destPath)) crop(pixelRect(box, pageSize), destPath);
    images.push({ name: `images/${file}`, path: destPath });
    const img = `<img src="images/${file}" alt="${altText(figure)}"/>`;
    return figure.replace(/(<figure\b[^>]*>)/, `$1${img}`);
  });
  return { body: out, images, skipped };
}

/** The real cropper: macOS sips, whose --cropOffset is (y, x) from the top-left corner. */
export function sipsCropper(pageImagePath) {
  return (rect, destPath) => {
    mkdirSync(join(destPath, ".."), { recursive: true });
    const result = spawnSync(
      "sips",
      [
        "-c",
        String(rect.height),
        String(rect.width),
        "--cropOffset",
        String(rect.y),
        String(rect.x),
        pageImagePath,
        "--out",
        destPath,
      ],
      { encoding: "utf-8" },
    );
    if (result.error || result.status !== 0) {
      throw new Error(`sips could not crop ${pageImagePath}: ${result.stderr || result.error}`);
    }
  };
}

/** Pixel size of an image, via sips. */
export function imageSize(path) {
  const result = spawnSync("sips", ["-g", "pixelWidth", "-g", "pixelHeight", path], {
    encoding: "utf-8",
  });
  const width = Number(/pixelWidth: (\d+)/.exec(result.stdout)?.[1]);
  const height = Number(/pixelHeight: (\d+)/.exec(result.stdout)?.[1]);
  if (!width || !height) throw new Error(`could not read the size of ${path}`);
  return { width, height };
}
