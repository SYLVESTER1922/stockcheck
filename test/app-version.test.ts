import { describe, expect, it } from 'vitest';
import { changesVersion, versionFromLog } from '../app-version';

// The version label comes from the last commit that changed anything except these (exclusion list).
describe('changesVersion', () => {
  it.each([
    'public/status.json',
    'docs/SPEC.md',
    'docs/adr/0006-access-switch.md',
    'test/report.test.ts',
    'test/fixtures/tiny.xlsx',
    'e2e/access.spec.ts',
    'scripts/make-icons.py',
    'CONTEXT.md',
    'README.md',
    'some/folder/NOTES.md',
    'private-notes/LEARNING.md',
  ])('%s does not change the version', (path) => {
    expect(changesVersion(path)).toBe(false);
  });

  it.each([
    'src/ui/App.tsx',
    'src/index.css',
    'public/icon-192.png',
    'public/status.json.bak',
    'index.html',
    'package.json',
    'package-lock.json',
    'vite.config.ts',
    'tsconfig.json',
    'tsconfig.app.json',
    'tailwind.config.js',
    'postcss.config.js',
    'playwright.config.ts',
    '.github/workflows/deploy.yml',
    'docs.ts',
    'testing/helper.ts',
    'brand-new-folder/anything.txt',
  ])('%s changes the version (anything not excluded does)', (path) => {
    expect(changesVersion(path)).toBe(true);
  });
});

describe('versionFromLog', () => {
  // `git log --format=@@%h %cs --name-only` output, newest first.
  const log = [
    '@@aaaaaaa 2026-10-07',
    '',
    'docs/SPEC.md',
    'CONTEXT.md',
    '@@bbbbbbb 2026-10-06',
    '',
    'public/status.json',
    '@@ccccccc 2026-10-05',
    '',
    'src/ui/App.tsx',
    'docs/TICKETS.md',
    '@@ddddddd 2026-10-04',
    '',
    'src/domain/report.ts',
  ].join('\n');

  it('skips commits that only touch excluded paths', () => {
    expect(versionFromLog(log)).toBe('ccccccc · 2026-10-05');
  });

  it('uses the newest commit when it touches app code', () => {
    expect(versionFromLog(`@@eeeeeee 2026-10-08\n\ntailwind.config.js\n${log}`)).toBe('eeeeeee · 2026-10-08');
  });

  it('falls back to "dev" when nothing qualifies', () => {
    expect(versionFromLog('@@aaaaaaa 2026-10-07\n\ndocs/SPEC.md')).toBe('dev');
    expect(versionFromLog('')).toBe('dev');
  });
});
