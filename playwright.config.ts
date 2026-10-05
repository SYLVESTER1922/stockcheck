import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build, as served on Pages.
export default defineConfig({
  testDir: 'e2e',
  use: { baseURL: 'http://localhost:4173', ...devices['Pixel 7'] },
  projects: [{ name: 'chromium' }],
  webServer: {
    command: 'npm run build && npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
  },
});
