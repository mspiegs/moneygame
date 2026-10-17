// Local dev server: serves the static app and runs api/*.js the way Vercel does
// (Web-standard handlers: export async function GET(request) { return Response }).
// Usage: npm run dev   (PORT defaults to 8017)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { Readable } from 'node:stream';

const root = new URL('..', import.meta.url).pathname;
const port = Number(process.env.PORT) || 8017;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon' };

async function api(req, res, path) {
  const name = path.slice('/api/'.length).replace(/\/$/, '');
  if (!/^[a-z0-9-]+(\/[a-z0-9-]+)*$/.test(name)) return send(res, 404, 'Not found');
  let mod;
  try {
    // Cache-bust so edits to API files take effect without restarting.
    mod = await import(`${join(root, 'api', name)}.js?t=${Date.now()}`);
  } catch (e) {
    if (e.code === 'ERR_MODULE_NOT_FOUND') return send(res, 404, 'Not found');
    throw e;
  }
  const handler = mod[req.method];
  if (!handler) return send(res, 405, 'Method not allowed');
  const body = ['GET', 'HEAD'].includes(req.method) ? undefined : Readable.toWeb(req);
  const request = new Request(`http://localhost:${port}${req.url}`, { method: req.method, headers: req.headers, body, duplex: 'half' });
  const response = await handler(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}

async function file(res, path) {
  let p = normalize(join(root, decodeURIComponent(path)));
  if (!p.startsWith(root) || /\/(\.|node_modules|db|scripts|api)/.test(p.slice(root.length - 1))) return send(res, 404, 'Not found');
  if ((await stat(p).catch(() => null))?.isDirectory()) p = join(p, 'index.html');
  const data = await readFile(p).catch(() => null);
  if (!data) return send(res, 404, 'Not found');
  res.writeHead(200, { 'content-type': types[extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
  res.end(data);
}

function send(res, status, text) {
  res.writeHead(status, { 'content-type': 'text/plain' });
  res.end(text);
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://x');
  try {
    if (pathname.startsWith('/api/')) await api(req, res, pathname);
    else await file(res, pathname);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, 'Server error');
  }
  console.log(`${req.method} ${req.url} ${res.statusCode}`);
}).listen(port, () => console.log(`Dormie on http://localhost:${port}`));
