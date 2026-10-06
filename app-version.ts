/**
 * The app version shown in the footer: the last commit that changed anything EXCEPT the paths
 * below. An exclusion list (not an allowlist), so any new or unknown path changes the version:
 * an unnecessary update banner is the safe failure, a missed update is not (ADR 0006).
 */
const EXCLUDED: ((path: string) => boolean)[] = [
  (p) => p === 'public/status.json', // the Access Switch
  (p) => p.startsWith('docs/'),
  (p) => p.startsWith('test/') || p.startsWith('e2e/'),
  (p) => p.startsWith('scripts/'),
  (p) => p.startsWith('private-notes/'),
  (p) => p.endsWith('.md'),
];

export const changesVersion = (path: string) => !EXCLUDED.some((excluded) => excluded(path));

/** Reads `git log --format=@@%h %cs --name-only` (newest first) and returns "<hash> · <date>". */
export function versionFromLog(log: string): string {
  for (const commit of log.split('@@').slice(1)) {
    const [header = '', ...paths] = commit.split('\n').map((line) => line.trim());
    if (paths.some((path) => path !== '' && changesVersion(path))) {
      const [hash, date] = header.split(' ');
      return `${hash} · ${date}`;
    }
  }
  return 'dev';
}
