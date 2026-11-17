// serve.ts — a tiny static server for previewing the app in app/
// on this machine. Node 22+, standard library only.
//
//   node serve.ts               http://localhost:8080
//   node serve.ts --port 8123   that port instead
//
// Requests map onto files under app/ (a directory path lands on its
// index.html), HEAD answers headers only, and any path that would
// climb out of app/ is refused. It exists for local development and
// for the screenshot runs; the app itself needs no server at all —
// any static host will do.

import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = resolve(fileURLToPath(new URL('./app/', import.meta.url)));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function portFrom(argv) {
  const at = argv.indexOf('--port');
  const n = at >= 0 ? Number(argv[at + 1]) : NaN;
  return Number.isInteger(n) && n > 0 && n < 65536 ? n : 8080;
}

// Resolve a request path to a file inside app/, or null when the
// path escapes the directory (encoded dots included — the caller
// decodes before asking).
function inside(pathname) {
  const rel = pathname.endsWith('/') ? `${pathname}index.html` : pathname;
  const file = resolve(APP_DIR, `.${rel}`);
  return file === APP_DIR || file.startsWith(APP_DIR + sep) ? file : null;
}

async function serve(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    res.end('GET or HEAD only\n');
    return;
  }
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    res.end('unparsable path\n');
    return;
  }
  const file = inside(pathname);
  if (file === null) {
    res.writeHead(403);
    res.end('outside the app directory\n');
    return;
  }
  let info;
  try {
    info = await stat(file);
    if (!info.isFile()) throw new Error('directory');
  } catch {
    res.writeHead(404);
    res.end('no such file\n');
    return;
  }
  res.writeHead(200, {
    'content-type': MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    'content-length': info.size,
    'cache-control': 'no-store',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  const body = createReadStream(file);
  body.on('error', () => res.destroy()); // file vanished mid-answer
  body.pipe(res);
}

const server = createServer((req, res) => {
  serve(req, res).catch(() => {
    if (!res.headersSent) res.writeHead(500);
    res.end('server error\n');
  });
});

server.listen(portFrom(process.argv.slice(2)), '127.0.0.1', () => {
  console.log(`serving app/ at http://127.0.0.1:${server.address().port}`);
});
