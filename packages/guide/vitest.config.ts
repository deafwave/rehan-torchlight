import { defineConfig } from 'vitest/config';
import { pinRoot } from './src/pin.ts';

// @dps/* = the pinned dps-debug model (read-only). DPS_DEBUG_PIN overrides the pin's root (the dps-debug checkout, not model/).
const pin = pinRoot();
export default defineConfig({
  resolve: { alias: [{ find: /^@dps\/(.*)$/, replacement: `${pin.replaceAll('\\', '/')}/model/$1` }] },
  test: { testTimeout: 120_000 },
});
