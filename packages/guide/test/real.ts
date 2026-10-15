/** Real-figure tests spawn dps-debug workers: opt in with GUIDE_REAL=1, and never while the owner's game capture flag exists. */
import { existsSync } from 'node:fs';
import { DEFAULT_BUSY_FILE } from '../src/engine/pool';

const GAME_BUSY = DEFAULT_BUSY_FILE;
export function realSkip(): string | undefined {
  if (process.env.GUIDE_REAL !== '1') return 'real figures skipped: set GUIDE_REAL=1 to run them';
  if (existsSync(GAME_BUSY)) return `real figures skipped: ${GAME_BUSY} exists (game capture running)`;
  return undefined;
}
