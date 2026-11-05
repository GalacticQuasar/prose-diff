import { describe, expect, it } from 'vitest';
import { openBrowser, openCommands } from './open.ts';

const URL = 'http://127.0.0.1:1234/?t=abc';
const exits = (code: number): [string, ...string[]] => [process.execPath, '-e', `process.exit(${code})`];

describe('openCommands', () => {
  it('uses xdg-open on Linux', () => {
    expect(openCommands(URL, 'linux', '6.8.0-45-generic')).toEqual([['xdg-open', URL]]);
  });

  it.each(['6.6.87.2-microsoft-standard-WSL2', '4.4.0-19041-Microsoft'])('tries wslview, then cmd.exe, on WSL (%s)', (osRelease) => {
    expect(openCommands(URL, 'linux', osRelease)).toEqual([
      ['wslview', URL],
      ['cmd.exe', '/c', 'start', '', URL],
    ]);
  });

  it('uses open on macOS and start on Windows', () => {
    expect(openCommands(URL, 'darwin')).toEqual([['open', URL]]);
    expect(openCommands(URL, 'win32')).toEqual([['cmd.exe', '/c', 'start', '', URL]]);
  });
});

describe('openBrowser', () => {
  it('succeeds when a command exits cleanly', async () => {
    expect(await openBrowser(URL, [exits(0)])).toBe(true);
  });

  it('moves on from a missing command or a failing one', async () => {
    expect(await openBrowser(URL, [['prose-diff-no-such-command'], exits(1), exits(0)])).toBe(true);
  });

  it('reports failure when every command fails', async () => {
    expect(await openBrowser(URL, [['prose-diff-no-such-command'], exits(1)])).toBe(false);
  });
});
