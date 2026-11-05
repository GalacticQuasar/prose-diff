#!/usr/bin/env node
// prose-diff <file>: snapshot a file, then review edits to it in the browser and write the merged result back.
import { existsSync } from 'node:fs';
import { relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { openBrowser } from './open.ts';
import { startServer } from './server.ts';

const USAGE = `Usage: prose-diff <file> [--port <n>] [--open]

Saves <file> as it is now, then serves a review page. Edit the file however
you like, open (or refresh) the page to review the changes, and Apply to
write the merged result back.

Options:
  -p, --port <n>  Port to listen on (default: any free port)
  -o, --open      Open the review page in your browser
  -h, --help      Show this help`;

function fail(message: string): never {
  console.error(`prose-diff: ${message}`);
  process.exit(1);
}

let args;
try {
  args = parseArgs({
    allowPositionals: true,
    options: {
      port: { type: 'string', short: 'p' },
      open: { type: 'boolean', short: 'o' },
      help: { type: 'boolean', short: 'h' },
    },
  });
} catch (err) {
  fail(`${(err as Error).message}\n\n${USAGE}`);
}
if (args.values.help) {
  console.log(USAGE);
  process.exit(0);
}
if (args.positionals.length !== 1) fail(`expected one file\n\n${USAGE}`);

const file = args.positionals[0];
const port = args.values.port === undefined ? 0 : Number(args.values.port);
if (!Number.isInteger(port) || port < 0 || port > 65535) fail(`invalid port: ${args.values.port}`);
if (!existsSync(file)) fail(`${file}: no such file`);

const distDir = fileURLToPath(new URL('../dist', import.meta.url));
if (!existsSync(`${distDir}/index.html`)) fail('the app is not built; run `npm run build` in the prose-diff repo first');

try {
  const server = await startServer({ file, distDir, port });
  console.log(`Watching ${relative(process.cwd(), file) || file}. Original saved.`);
  console.log(`Review at ${server.url}   (Ctrl+C to stop)`);
  const stop = () => void server.close().then(() => process.exit(0));
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  if (args.values.open) {
    void openBrowser(server.url).then((opened) => {
      if (!opened) console.error('prose-diff: could not open a browser; use the link above');
    });
  }
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  fail(e.code === 'EADDRINUSE' ? `port ${port} is in use` : e.message);
}
