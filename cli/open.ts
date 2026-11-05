import { spawn } from 'node:child_process';
import { release } from 'node:os';

type Command = [command: string, ...args: string[]];

/** The commands that can open `url` here, in the order to try them. */
export function openCommands(url: string, platform: NodeJS.Platform = process.platform, osRelease = release()): Command[] {
  // The empty argument is `start`'s window title, which it would otherwise take from a quoted URL.
  const start = (cmd: string): Command => [cmd, '/c', 'start', '', url];
  if (platform === 'darwin') return [['open', url]];
  if (platform === 'win32') return [start('cmd.exe')];
  if (/microsoft/i.test(osRelease)) return [['wslview', url], start('cmd.exe')];
  return [['xdg-open', url]];
}

function run([command, ...args]: Command): Promise<boolean> {
  return new Promise((resolve) => {
    // Detached so Ctrl+C in the terminal can't reach a browser started by the command.
    const child = spawn(command, args, { stdio: 'ignore', detached: true });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
    child.unref();
  });
}

/**
 * Tries each command until one succeeds, and resolves to whether any did. It may
 * never resolve: without a desktop session, xdg-open can run the browser in the
 * foreground and only exit when it closes.
 */
export async function openBrowser(url: string, commands = openCommands(url)): Promise<boolean> {
  for (const command of commands) {
    if (await run(command)) return true;
  }
  return false;
}
