// File mode: the page was opened from `prose-diff <file>`, whose server holds
// the original and reads and writes the file. The printed link carries the
// API token as `?t=`.

export interface Session {
  path: string;
  name: string;
  original: string;
  revised: string;
  revisedHash: string;
  originalHash: string;
}

export interface Status {
  originalHash: string;
  revisedHash: string;
}

export const fileToken = new URLSearchParams(location.search).get('t');
export const isFileMode = fileToken !== null;

export type Result<T = Session> = { ok: true; data: T } | { ok: false; error: string; status?: number };

const SESSION_KEYS = ['path', 'name', 'original', 'revised', 'revisedHash', 'originalHash'] as const;
const STATUS_KEYS = ['originalHash', 'revisedHash'] as const;

async function call<T>(path: string, keys: readonly (keyof T & string)[], init: RequestInit = {}): Promise<Result<T>> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...init.headers, 'X-Prose-Diff-Token': fileToken ?? '' } });
  } catch {
    return { ok: false, error: 'Couldn’t reach prose-diff. Is it still running?' };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    const valid = keys.every((k) => typeof (body as Record<string, unknown>)[k] === 'string');
    return valid ? { ok: true, data: body as T } : { ok: false, error: 'This page wasn’t opened from prose-diff, or it answered unexpectedly.' };
  }
  const error =
    res.status === 403
      ? 'This link isn’t valid for the running prose-diff. Use the link it printed.'
      : ((body as { error?: string }).error ?? `prose-diff answered ${res.status}`);
  return { ok: false, error, status: res.status };
}

export const fetchSession = () => call<Session>('/api/session', SESSION_KEYS, { cache: 'no-store' });

export const fetchStatus = () => call<Status>('/api/status', STATUS_KEYS, { cache: 'no-store' });

export const applyMerged = (merged: string, revisedHash: string) =>
  call<Session>('/api/apply', SESSION_KEYS, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merged, revisedHash }),
  });
