// Servidor estático mínimo para desenvolvimento/testes (sem dependências).
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve } from 'node:path';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.md': 'text/markdown; charset=utf-8',
};

export function startServer({ root = resolve(import.meta.dirname, '..'), port = 8080 } = {}) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
      if (rel.startsWith('..')) throw Object.assign(new Error('forbidden'), { code: 403 });
      let file = join(root, rel);
      if ((await stat(file).catch(() => null))?.isDirectory()) file = join(file, 'index.html');
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch (e) {
      res.writeHead(e.code === 403 ? 403 : 404).end('not found');
    }
  });
  return new Promise((ok) => server.listen(port, () => ok(server)));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT) || 8080;
  await startServer({ port });
  console.log(`http://localhost:${port}`);
}
