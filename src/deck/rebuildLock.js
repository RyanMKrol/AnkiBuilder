import { existsSync, readFileSync, unlinkSync, writeFileSync } from "fs";
import { join } from "path";
import { hostname } from "os";
import { setTimeout as delay } from "timers/promises";

/**
 * A short lock around a book/course deck rebuild.
 *
 * Worth being precise about what this is for, because it is NOT the safety property. The
 * `.apkg` is published by an atomic rename, and that alone is what guarantees nobody ever
 * sees a half-written package. A lost or double-stolen lock is therefore *safe*, not merely
 * tolerable — which is why the stealing rules below can be as blunt as they are.
 *
 * What the lock buys is a narrow lost update. A rebuild reads the set of `done` lessons and
 * then writes one package. If process A is mid-rebuild when the dashboard marks lesson X
 * done, and B's rebuild simply gave up, X would be missing from the package until something
 * else triggered a rebuild. So B WAITS, and its rebuild then re-reads the done-set and picks
 * X up.
 *
 * It is a dotfile, not a lock directory: `listBooks` and `scanNumberedUnits` both enumerate
 * directories, so a lock dir would show up as a phantom book/unit.
 *
 * Scope is one book or course, held for the seconds a rebuild takes. Three lessons of three
 * different books never contend.
 */

export const LOCK_FILENAME = ".rebuild.lock";

export class RebuildBusyError extends Error {
  constructor(message) {
    super(message);
    this.name = "RebuildBusyError";
    this.code = "REBUILD_BUSY";
  }
}

export function lockPath(bookDir) {
  return join(bookDir, LOCK_FILENAME);
}

function readLock(bookDir) {
  try {
    return JSON.parse(readFileSync(lockPath(bookDir), "utf-8"));
  } catch {
    return null;
  }
}

function isHolderAlive(owner, { isPidAlive, hostname: host }) {
  if (!owner) return false;
  if (owner.host !== host()) return true; // can't probe another machine — assume alive
  return isPidAlive(owner.pid);
}

function defaultIsPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err.code === "EPERM";
  }
}

/**
 * Runs `fn` holding the book's rebuild lock, awaiting a real timer while another holder has
 * it. `fn` may be sync or async.
 */
export async function withRebuildLock(
  bookDir,
  fn,
  {
    ttlMs = 60_000,
    timeoutMs = 10_000,
    pollMs = 50,
    now = Date.now,
    isPidAlive = defaultIsPidAlive,
    hostname: host = hostname,
  } = {},
) {
  const path = lockPath(bookDir);
  const deadline = now() + timeoutMs;
  let held = false;

  while (!held) {
    try {
      // O_EXCL: one syscall that both compare-and-swaps and records who won.
      writeFileSync(
        path,
        JSON.stringify({
          pid: process.pid,
          host: host(),
          startedAt: new Date(now()).toISOString(),
        }),
        { flag: "wx" },
      );
      held = true;
      break;
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
    }

    const owner = readLock(bookDir);
    const age = owner ? now() - Date.parse(owner.startedAt) : Infinity;
    const stale =
      !owner ||
      !Number.isFinite(age) ||
      age > ttlMs ||
      !isHolderAlive(owner, { isPidAlive, hostname: host });
    if (stale) {
      // Safe to be blunt: the rename is what protects the package, so a double steal costs
      // duplicated work at worst.
      try {
        unlinkSync(path);
      } catch {
        /* someone else already cleared it */
      }
      continue;
    }

    if (now() >= deadline) {
      throw new RebuildBusyError(
        `another rebuild of ${bookDir} is in progress (pid ${owner.pid} on ${owner.host} since ${owner.startedAt})`,
      );
    }
    await delay(pollMs);
  }

  try {
    return await fn();
  } finally {
    // Only clear it if it is still ours — a lock we lost to a steal belongs to someone else now.
    const owner = readLock(bookDir);
    if (owner && owner.pid === process.pid && owner.host === host()) {
      try {
        unlinkSync(path);
      } catch {
        /* already gone */
      }
    }
  }
}

export function isRebuildLocked(bookDir) {
  return existsSync(lockPath(bookDir));
}
