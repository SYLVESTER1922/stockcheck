import { defineConfig } from 'vitest/config';

// Local-only checks against a real client Export (spec §5). Never run in CI.
export default defineConfig({
  test: { include: ['test/local/**/*.test.ts'] },
});
