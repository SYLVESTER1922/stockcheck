// After a deploy: fail unless the LIVE /status.json matches the committed public/status.json (ADR 0006).
// Retries for up to ~2 minutes (Pages and its CDN can take a moment). Never relaxed silently.
// Usage: node scripts/check-live-status.mts <site URL> [timeout ms]
import { readFileSync } from 'node:fs';

type Status = { newSessions?: unknown; message?: unknown };
const [, , site = 'https://stockcheck.netrisyl.com/', timeoutArg = '120000'] = process.argv;
const committed = JSON.parse(readFileSync('public/status.json', 'utf8')) as Status;
const same = (a: Status, b: Status) => a.newSessions === b.newSessions && (a.message ?? '') === (b.message ?? '');

const deadline = Date.now() + Number(timeoutArg);
let lastSeen = '(no response yet)';
for (let attempt = 1; ; attempt++) {
  try {
    const response = await fetch(new URL(`status.json?t=${Date.now()}-${attempt}`, site), { cache: 'no-store' });
    lastSeen = `${response.status} ${(await response.text()).trim()}`;
    if (response.ok && same(JSON.parse(lastSeen.slice(4)) as Status, committed)) {
      console.log(`Live status.json matches the committed file (attempt ${attempt}): ${lastSeen.slice(4)}`);
      process.exit(0);
    }
  } catch (error) {
    lastSeen = `error: ${String(error)}`;
  }
  if (Date.now() >= deadline) break;
  console.log(`Attempt ${attempt}: not matching yet (${lastSeen}); retrying in 10 s`);
  await new Promise((resolve) => setTimeout(resolve, 10_000));
}
console.error(`Live status.json does not match after ${Number(timeoutArg) / 1000} s.`);
console.error(`Committed: ${JSON.stringify(committed)}`);
console.error(`Live:      ${lastSeen}`);
process.exit(1);
