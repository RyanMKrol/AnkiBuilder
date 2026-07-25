import { existsSync, mkdirSync, renameSync, unlinkSync, writeFileSync, copyFileSync } from "fs";
import { promises as fsp } from "fs";
import { dirname, join, basename } from "path";

/**
 * Atomic file publishing: write to a temp file in the SAME directory, then rename it
 * into place. `rename(2)` is atomic within a filesystem, so a concurrent reader sees
 * either the complete old file or the complete new one — never a half-written one.
 *
 * This matters because several files here are written by one process while another is
 * reading them: `cards.json` (CLI stage vs dashboard vs deck rebuild), the reviewed-corpus
 * dedup library (dashboard's "Mark reviewed" vs a concurrent assemble's backward dedup),
 * and the TTS cache (one run writes a clip another run copies into its deck). Most of
 * those readers `JSON.parse` with no try/catch, so a torn read is a hard failure, not a
 * glitch.
 *
 * IMPORTANT: the temp file MUST live in the destination's own directory. `rename` fails
 * with EXDEV across filesystems, so a temp in `os.tmpdir()` would break whenever the
 * destination is on another volume.
 *
 * Deliberately NOT fsync'd. Rename is atomic with respect to other processes regardless
 * of fsync; fsync only buys durability across a power cut, and it costs real time on a
 * 10 MB `.apkg`. See LIMITATIONS.
 *
 * Not for user-chosen output paths (`restyle-font --out`, `view-deck --out`): those have
 * no concurrent reader, and rename replaces the inode — dropping any hardlinks, ACLs or
 * xattrs set on an existing destination.
 */

// Distinguishes concurrent writers of the same destination within and across processes.
let counter = 0;

function tempPathFor(destPath) {
  counter += 1;
  return join(dirname(destPath), `.${basename(destPath)}.tmp.${process.pid}.${counter}`);
}

function discard(tempPath) {
  try {
    unlinkSync(tempPath);
  } catch {
    /* already gone (renamed, or never created) — nothing to clean up */
  }
}

/**
 * Writes `data` to `destPath` atomically. `options` is passed through to writeFileSync
 * (e.g. "utf-8"), so a call site can keep its exact existing encoding/serialization.
 */
export function writeFileAtomic(destPath, data, options) {
  mkdirSync(dirname(destPath), { recursive: true });
  const tempPath = tempPathFor(destPath);
  try {
    writeFileSync(tempPath, data, options);
    renameSync(tempPath, destPath);
  } catch (err) {
    discard(tempPath);
    throw err;
  }
}

/** Async twin of writeFileAtomic, for the one call site that already awaits its write. */
export async function writeFileAtomicAsync(destPath, data, options) {
  await fsp.mkdir(dirname(destPath), { recursive: true });
  const tempPath = tempPathFor(destPath);
  try {
    await fsp.writeFile(tempPath, data, options);
    await fsp.rename(tempPath, destPath);
  } catch (err) {
    try {
      await fsp.unlink(tempPath);
    } catch {
      /* already gone */
    }
    throw err;
  }
}

/**
 * Snapshots `path` to `<path><suffix>` the FIRST time only. A pipeline pass that rewrites a file
 * calls this before its write, so the pre-pass state stays recoverable — and re-running the pass
 * can never overwrite the original snapshot with an already-modified one.
 */
export function backupFileOnce(path, suffix) {
  const backupPath = path + suffix;
  if (existsSync(backupPath)) return false;
  copyFileAtomic(path, backupPath);
  return true;
}

/**
 * Copies `srcPath` to `destPath` atomically. Used for the multi-MB EPUB copies, where an
 * `existsSync`-then-`copyFileSync` from two concurrent first-time assembles of the same
 * book would otherwise interleave into one file that everything downstream hashes and unzips.
 */
export function copyFileAtomic(srcPath, destPath) {
  mkdirSync(dirname(destPath), { recursive: true });
  const tempPath = tempPathFor(destPath);
  try {
    copyFileSync(srcPath, tempPath);
    renameSync(tempPath, destPath);
  } catch (err) {
    discard(tempPath);
    throw err;
  }
}
