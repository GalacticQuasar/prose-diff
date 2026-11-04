import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { startServer, type ProseServer, type Session } from './server.ts';

const TOKEN = 'test-token';

let dir: string;
let file: string;
let server: ProseServer;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'prose-diff-'));
  file = join(dir, 'draft.md');
  await writeFile(file, 'The quick brown fox.\n');
  await mkdir(join(dir, 'dist'));
  await writeFile(join(dir, 'dist', 'index.html'), '<!doctype html><title>app</title>');
  server = await startServer({ file, distDir: join(dir, 'dist'), token: TOKEN });
});

afterEach(async () => {
  await server.close();
  await rm(dir, { recursive: true, force: true });
});

/** node:http rather than fetch, so tests can set the Host header. */
function call(path: string, opts: { method?: string; body?: unknown; token?: string | null; host?: string } = {}) {
  const { method = 'GET', body, token = TOKEN, host = `127.0.0.1:${server.port}` } = opts;
  const headers: Record<string, string> = { Host: host };
  if (token !== null) headers['X-Prose-Diff-Token'] = token;
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  return new Promise<{ status: number; json: () => any; text: string }>((ok, fail) => {
    const req = request({ host: '127.0.0.1', port: server.port, path, method, headers }, (res) => {
      let text = '';
      res.setEncoding('utf8');
      res.on('data', (c: string) => (text += c));
      res.on('end', () => ok({ status: res.statusCode!, text, json: () => JSON.parse(text) }));
    });
    req.on('error', fail);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
}

const getSession = async () => (await call('/api/session')).json() as Session;

describe('session', () => {
  it('reads the file fresh on every request', async () => {
    let s = await getSession();
    expect(s.name).toBe('draft.md');
    expect(s.original).toBe('The quick brown fox.\n');
    expect(s.revised).toBe(s.original);

    await writeFile(file, 'The quick red fox.\n');
    s = await getSession();
    expect(s.original).toBe('The quick brown fox.\n');
    expect(s.revised).toBe('The quick red fox.\n');
  });
});

describe('apply', () => {
  it('writes the merged text and makes it the new original', async () => {
    await writeFile(file, 'The quick red fox.\n');
    const { revisedHash } = await getSession();
    const res = await call('/api/apply', { method: 'POST', body: { merged: 'The quick red dog.\n', revisedHash } });
    expect(res.status).toBe(200);
    const s = res.json() as Session;
    expect(s.original).toBe('The quick red dog.\n');
    expect(s.revised).toBe('The quick red dog.\n');
    expect(await readFile(file, 'utf8')).toBe('The quick red dog.\n');
    // No temp files left behind.
    expect((await readdir(dir)).sort()).toEqual(['dist', 'draft.md']);
  });

  it('refuses when the file changed since the session was loaded', async () => {
    const { revisedHash } = await getSession();
    await writeFile(file, 'Edited again.\n');
    const res = await call('/api/apply', { method: 'POST', body: { merged: 'Merged.\n', revisedHash } });
    expect(res.status).toBe(409);
    expect(await readFile(file, 'utf8')).toBe('Edited again.\n');
    expect((await getSession()).original).toBe('The quick brown fox.\n');
  });

  it('rejects a malformed body', async () => {
    expect((await call('/api/apply', { method: 'POST', body: { merged: 1 } })).status).toBe(400);
  });

  it('round-trips CRLF line endings', async () => {
    await writeFile(file, 'one\r\ntwo\r\n');
    const s = await getSession();
    expect(s.revised).toBe('one\ntwo\n');
    await call('/api/apply', { method: 'POST', body: { merged: 'one\nthree\n', revisedHash: s.revisedHash } });
    expect(await readFile(file, 'utf8')).toBe('one\r\nthree\r\n');
  });
});

describe('access', () => {
  it('requires the token', async () => {
    expect((await call('/api/session', { token: null })).status).toBe(403);
    expect((await call('/api/session', { token: 'wrong-token' })).status).toBe(403);
    const { revisedHash } = await getSession();
    const res = await call('/api/apply', { method: 'POST', token: null, body: { merged: 'x', revisedHash } });
    expect(res.status).toBe(403);
    expect(await readFile(file, 'utf8')).toBe('The quick brown fox.\n');
  });

  it('rejects other Host headers', async () => {
    expect((await call('/api/session', { host: 'evil.example' })).status).toBe(403);
    expect((await call('/', { host: `evil.example:${server.port}` })).status).toBe(403);
    expect((await call('/', { host: `localhost:${server.port}` })).status).toBe(200);
  });

  it('serves the app but nothing outside it', async () => {
    const res = await call('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>app</title>');
    expect((await call('/%2e%2e/draft.md')).status).toBe(404);
    expect((await call('/..%2fdraft.md')).status).toBe(404);
  });
});
