import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { readFile, realpath, rename, stat, unlink, writeFile } from 'node:fs/promises';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { basename, dirname, extname, join, resolve, sep } from 'node:path';

export interface Session {
  /** Absolute path of the file being reviewed. */
  path: string;
  name: string;
  /** The snapshot: the file as it was at startup or after the last apply. */
  original: string;
  /** The file as it is on disk now. */
  revised: string;
  /** Hash of the file's bytes on disk, echoed back on apply to detect later edits. */
  revisedHash: string;
}

export interface ServerOptions {
  file: string;
  /** Directory of the built app to serve, or null to serve only the API. */
  distDir: string | null;
  port?: number;
  /** Fixed token, for tests. Random by default. */
  token?: string;
}

export interface ProseServer {
  url: string;
  port: number;
  token: string;
  close(): Promise<void>;
}

const MAX_BODY = 64 * 1024 * 1024;

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.json': 'application/json',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const sha256 = (data: string | Buffer) => createHash('sha256').update(data).digest('hex');

/** The file's text with CRLF normalized to LF (the diff works on LF), plus what it needs to be written back. */
async function readText(path: string) {
  const raw = await readFile(path);
  const text = raw.toString('utf8');
  return { text: text.replace(/\r\n/g, '\n'), crlf: text.includes('\r\n'), hash: sha256(raw) };
}

/** Write via a temp file and rename, so a crash never leaves the file half-written. */
async function writeAtomic(path: string, text: string) {
  const tmp = join(dirname(path), `.${basename(path)}.prose-diff-${randomBytes(4).toString('hex')}.tmp`);
  const { mode } = await stat(path);
  try {
    await writeFile(tmp, text, { mode });
    await rename(tmp, path);
  } catch (err) {
    await unlink(tmp).catch(() => {});
    throw err;
  }
}

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}

export async function startServer(opts: ServerOptions): Promise<ProseServer> {
  // Resolve symlinks so an atomic rename replaces the target, not the link.
  const path = await realpath(resolve(opts.file));
  const name = basename(path);
  const token = opts.token ?? randomBytes(16).toString('hex');
  const tokenBuf = Buffer.from(token);
  let original = (await readText(path)).text;
  let port = 0;

  async function session(): Promise<Session> {
    const { text, hash } = await readText(path);
    return { path, name, original, revised: text, revisedHash: hash };
  }

  function authorized(req: IncomingMessage) {
    const given = req.headers['x-prose-diff-token'];
    if (typeof given !== 'string') return false;
    const buf = Buffer.from(given);
    return buf.length === tokenBuf.length && timingSafeEqual(buf, tokenBuf);
  }

  async function apply(req: IncomingMessage) {
    const body = (await readJson(req)) as { merged?: unknown; revisedHash?: unknown };
    if (typeof body.merged !== 'string' || typeof body.revisedHash !== 'string') {
      throw new HttpError(400, 'Expected { merged, revisedHash }');
    }
    const current = await readText(path);
    if (current.hash !== body.revisedHash) {
      throw new HttpError(409, `${name} changed since you loaded it`);
    }
    const merged = body.merged.replace(/\r\n/g, '\n');
    await writeAtomic(path, current.crlf ? merged.replace(/\n/g, '\r\n') : merged);
    original = merged;
    return session();
  }

  async function serveStatic(pathname: string, res: ServerResponse) {
    if (!opts.distDir) throw new HttpError(404, 'Not found');
    const root = resolve(opts.distDir);
    const file = resolve(root, '.' + (pathname === '/' ? '/index.html' : pathname));
    if (file !== root && !file.startsWith(root + sep)) throw new HttpError(404, 'Not found');
    let data: Buffer;
    try {
      data = await readFile(file);
    } catch {
      throw new HttpError(404, 'Not found');
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    // Only answer requests addressed to us by a loopback name; blocks DNS rebinding.
    const host = req.headers.host;
    if (host !== `127.0.0.1:${port}` && host !== `localhost:${port}`) throw new HttpError(403, 'Forbidden host');

    const { pathname } = new URL(req.url ?? '/', 'http://localhost');
    if (pathname.startsWith('/api/')) {
      // The custom token header forces a CORS preflight, which is never answered,
      // so other pages can't call the API even if they guess the port.
      if (!authorized(req)) throw new HttpError(403, 'Missing or wrong token');
      if (pathname === '/api/session' && req.method === 'GET') return send(res, 200, await session());
      if (pathname === '/api/apply' && req.method === 'POST') return send(res, 200, await apply(req));
      throw new HttpError(404, 'Not found');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed');
    let decoded: string;
    try {
      decoded = decodeURIComponent(pathname);
    } catch {
      throw new HttpError(400, 'Bad path');
    }
    return serveStatic(decoded, res);
  }

  const server = createServer((req, res) => {
    handle(req, res).catch((err: unknown) => {
      const status = err instanceof HttpError ? err.status : 500;
      const message = err instanceof Error ? err.message : String(err);
      if (!res.headersSent) send(res, status, { error: message });
      else res.end();
    });
  });

  await new Promise<void>((ok, fail) => {
    server.once('error', fail);
    server.listen(opts.port ?? 0, '127.0.0.1', () => ok());
  });
  port = (server.address() as AddressInfo).port;

  return {
    url: `http://127.0.0.1:${port}/?t=${token}`,
    port,
    token,
    close: () =>
      new Promise<void>((ok) => {
        server.close(() => ok());
        server.closeAllConnections();
      }),
  };
}
