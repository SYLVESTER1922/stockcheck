/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { execSync } from 'node:child_process';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Shown in the app footer. Taken from the last commit that changed app code, ignoring
 * public/status.json, so flipping the Access Switch rebuilds identical files and phones
 * don't see a "new version" banner (ADR 0006).
 */
function appVersion(): string {
  if (process.env.STOCKCHECK_VERSION) return process.env.STOCKCHECK_VERSION;
  try {
    return execSync(`git log -1 --format="%h · %cs" -- . ":(exclude)public/status.json"`, { encoding: 'utf8' }).trim() || 'dev';
  } catch {
    return 'dev';
  }
}
const version = appVersion();

// Served from the root of https://stockcheck.netrisyl.com (ADR 0005).
export default defineConfig({
  base: '/',
  define: { __APP_VERSION__: JSON.stringify(version) },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      // A new version waits until the Counter taps "Update now"; it never reloads the app by itself.
      registerType: 'prompt',
      injectRegister: false,
      manifest: {
        name: 'StockCheck',
        short_name: 'StockCheck',
        description: 'Count stock against a Zobaze Export and see the variance at cost.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#f8fafc',
        theme_color: '#0f172a',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Precache everything, including the SheetJS chunk, so a cold start works with no signal.
        globPatterns: ['**/*.{js,css,html,png,jpg,webmanifest}'],
        // The Access Switch must always come from the network (ADR 0006).
        globIgnores: ['**/status.json'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        // Take control of the open page once active, so "Update now" reloads even on a first visit.
        clientsClaim: true,
      },
    }),
  ],
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/local/**', 'node_modules/**'],
  },
});
