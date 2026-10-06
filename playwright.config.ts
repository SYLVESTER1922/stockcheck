import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a production build in the test server's OWN directory, .e2e-build/
// (gitignored), never dist/ (the deploy build) and never public/. Its status.json is overwritten
// with "enabled" there, so the tests never depend on the live Access Switch (ADR 0006).
const E2E_BUILD = '.e2e-build';
const ENABLED = JSON.stringify({ newSessions: 'enabled', message: '' });

export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173', ...devices['Pixel 7'] },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: [
      `npx vite build --outDir ${E2E_BUILD} --emptyOutDir`,
      `node -e "require('fs').writeFileSync('${E2E_BUILD}/status.json', process.argv[1])" '${ENABLED}'`,
      `npx vite preview --outDir ${E2E_BUILD} --port 4173 --strictPort`,
    ].join(' && '),
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
