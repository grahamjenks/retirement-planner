import { defineConfig } from 'vitest/config'

/**
 * Tests cover `src/lib` — the projection engine, the tax rules, the storage
 * coercion and the optimiser. Those are plain functions over plain data, so
 * they need no DOM; the two modules that do touch `window.localStorage` only
 * do so inside functions, and the tests for those stub it.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
