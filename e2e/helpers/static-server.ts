import { readFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import { extname, join, normalize } from 'node:path';

const TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.json': 'application/json',
};

// These tests are about updates, not the Access Switch: always answer "enabled" (ADR 0006).
// Served from memory; nothing is written to disk.
const ENABLED = JSON.stringify({ newSessions: 'enabled', message: '' });

/** Serves whichever folder `root()` returns, reading from disk on every request, like a fresh deploy. */
export function serve(root: () => string, port: number): Promise<Server> {
  const server = createServer(async (req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    if (path === '/status.json') {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      res.end(ENABLED);
      return;
    }
    try {
      const body = await readFile(join(root(), path.endsWith('/') ? `${path}index.html` : path));
      res.writeHead(200, { 'Content-Type': TYPES[extname(path)] ?? 'text/html', 'Cache-Control': 'max-age=600' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => server.listen(port, () => resolve(server)));
}
