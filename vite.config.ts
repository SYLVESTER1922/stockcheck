/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Served from the root of https://stockcheck.netrisyl.com (ADR 0005).
export default defineConfig({
  base: '/',
  plugins: [react(), tailwindcss()],
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/local/**', 'node_modules/**'],
  },
});
