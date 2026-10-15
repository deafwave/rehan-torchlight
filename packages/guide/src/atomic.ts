import { renameSync, rmSync, writeFileSync } from 'node:fs';

/** Write `<file>.tmp-<pid>` then rename over `file`. A reader holding the target on Windows (EPERM/EBUSY) is retried a few times;
 *  a still-failing write is logged, the temp file removed, and false returned so a checkpoint never aborts the run. */
export function writeAtomic(file: string, text: string, tries = 5, delayMs = 100): boolean {
  const tmp = `${file}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, text);
    for (let i = 1; ; i++) {
      try { renameSync(tmp, file); return true; }
      catch (e) {
        const code = (e as NodeJS.ErrnoException).code;
        if ((code !== 'EPERM' && code !== 'EBUSY') || i >= tries) throw e;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      }
    }
  } catch (e) {
    rmSync(tmp, { force: true });
    console.warn(`could not write ${file} (${(e as Error).message}); the next checkpoint retries`);
    return false;
  }
}
