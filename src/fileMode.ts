// File mode: the page was opened from `prose-diff <file>`, whose server holds
// the original and reads and writes the file. The printed link carries the
// API token as `?t=`.

export interface Session {
  path: string;
  name: string;
  original: string;
  revised: string;
  revisedHash: string;
}

export const fileToken = new URLSearchParams(location.search).get('t');
export const isFileMode = fileToken !== null;

export type Result = { ok: true; session: Session } | { ok: false; error: string; status?: number };

async function call(path: string, init: RequestInit = {}): Promise<Result> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { ...init.headers, 'X-Prose-Diff-Token': fileToken ?? '' } });
  } catch {
    return { ok: false, error: 'Couldn’t reach prose-diff. Is it still running?' };
  }
  const body = await res.json().catch(() => ({}));
  if (res.ok) {
    const s = body as Partial<Session>;
    const valid = (['path', 'name', 'original', 'revised', 'revisedHash'] as const).every((k) => typeof s[k] === 'string');
    return valid ? { ok: true, session: s as Session } : { ok: false, error: 'This page wasn’t opened from prose-diff, or it answered unexpectedly.' };
  }
  const error =
    res.status === 403
      ? 'This link isn’t valid for the running prose-diff. Use the link it printed.'
      : ((body as { error?: string }).error ?? `prose-diff answered ${res.status}`);
  return { ok: false, error, status: res.status };
}

export const fetchSession = () => call('/api/session', { cache: 'no-store' });

export const applyMerged = (merged: string, revisedHash: string) =>
  call('/api/apply', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ merged, revisedHash }),
  });
