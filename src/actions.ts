import { countDecisions, mergeResult } from './diff';
import { applyMerged, fetchSession } from './fileMode';
import { revisedInput } from './render';
import { compare, continueFromResult, getSegments, openSession, setFileError, state } from './state';
import { showToast } from './toast';

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** " 3 undecided changes kept as original." for toasts, or '' when all are decided. */
function keptNote() {
  const { pending } = countDecisions(getSegments(), state.decisions);
  return pending ? ` ${plural(pending, 'undecided change')} kept as original.` : '';
}

export function compareInputs() {
  if (!compare()) showToast('Paste some text first');
}

export function nextRound() {
  const note = keptNote();
  const restore = continueFromResult();
  revisedInput.focus();
  showToast(`Result is the new original.${note}`, { label: 'Undo', run: restore });
}

async function writeClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Clipboard API is unavailable on non-secure origins; fall back.
  }
  const ta = document.createElement('textarea');
  ta.value = text;
  document.body.append(ta);
  ta.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    ta.remove();
  }
}

export async function copyResult() {
  const ok = await writeClipboard(mergeResult(getSegments(), state.decisions));
  showToast(ok ? `Copied.${keptNote()}` : 'Couldn’t copy to the clipboard.');
}

/** File mode: load the file's session on startup. */
export async function loadFile() {
  const res = await fetchSession();
  if (res.ok) openSession(res.session);
  else setFileError(res.error);
}

/** File mode: re-read the file from disk. */
export async function reloadFile() {
  const res = await fetchSession();
  if (res.ok) openSession(res.session);
  else showToast(res.error);
}

let applying = false;

/** File mode: write the merged result to the file; it becomes the new original. */
export async function applyToFile() {
  const { file } = state;
  if (!file || applying) return;
  const { total, pending } = countDecisions(getSegments(), state.decisions);
  if (!total) {
    showToast('No changes to apply.');
    return;
  }
  if (pending && !confirm(`${plural(pending, 'undecided change')} will be reverted to the original. Apply to ${file.name} anyway?`)) return;

  applying = true;
  try {
    const res = await applyMerged(mergeResult(getSegments(), state.decisions), file.revisedHash);
    if (res.ok) {
      openSession(res.session);
      showToast(`Applied to ${file.name}.${pending ? ` ${plural(pending, 'undecided change')} reverted.` : ''}`);
    } else if (res.status === 409) {
      showToast(`${file.name} changed since you loaded it. Nothing was written.`, { label: 'Reload', run: () => void reloadFile() });
    } else {
      showToast(res.error);
    }
  } finally {
    applying = false;
  }
}
