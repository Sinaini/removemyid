import { defineConfig } from 'vitest/config'

// Deliberately separate from vite.config.ts: the app config runs the React
// plugin, Tailwind, and VitePWA, none of which are wanted (or cheap) under
// test. Keeping them apart also means a test run can't be broken by a
// build-plugin change.
export default defineConfig({
  test: {
    // `node`, not `jsdom`. Everything under src/lib/redaction and
    // src/lib/pipeline must be DOM-free so the Web Worker can import it —
    // running the tests without a DOM turns that constraint into a hard
    // failure instead of a convention (see purity.test.ts).
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // Explicit `import { describe, it, expect } from "vitest"` in each test
    // file, so no tsconfig needs a `types: ["vitest/globals"]` entry.
    globals: false,
  },
})
