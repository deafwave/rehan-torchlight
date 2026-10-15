import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { catalogDir, pinCommit, pinRoot, table } from '../src/pin';

const saved = process.env.DPS_DEBUG_PIN;
afterEach(() => { if (saved === undefined) delete process.env.DPS_DEBUG_PIN; else process.env.DPS_DEBUG_PIN = saved; });

describe('pin', () => {
  it('walks up to the pin without DPS_DEBUG_PIN, and honours the env var', () => {
    delete process.env.DPS_DEBUG_PIN;
    const found = pinRoot();
    expect(found.replaceAll('\\', '/')).toMatch(/dps-debug\/\.worktrees\/tli-lens-pin$/);
    expect(existsSync(catalogDir())).toBe(true);
    process.env.DPS_DEBUG_PIN = 'X:/elsewhere';
    expect(pinRoot()).toBe('X:/elsewhere');
  });
  it('table() returns the highest revision, parsed once', () => {
    delete process.env.DPS_DEBUG_PIN;
    const t = table<{ rows: object }>('config_talent');
    expect(t).toEqual(JSON.parse(readFileSync(join(catalogDir(), 'config_talent.r2.json'), 'utf8')));
    expect(table('config_talent')).toBe(t);
    expect(table('config_item_base')).toBeDefined();   // unrevised table
    expect(() => table('no_such_table')).toThrow(/not found/);
  });
  it('pinCommit() is a 40-hex string', () => { expect(pinCommit()).toMatch(/^[0-9a-f]{40}$/); });
});
