import { countDecisions, mergeResult } from './diff';
import { $ } from './dom';
import { applyMerged, fetchSession, fetchStatus } from './fileMode';
import { revisedInput } from './render';
import { compare, continueFromResult, getSegments, openSession, setFileError, setFileStale, state } from './state';
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
  if (res.ok) openSession(res.data);
  else setFileError(res.error);
}

/** File mode: re-read the file from disk. */
export async function reloadFile() {
  const res = await fetchSession();
  if (res.ok) openSession(res.data);
  else showToast(res.error);
}

/** Resolves to whether the reader chose Apply; Cancel and Esc both count as no. */
function confirmApply(message: string) {
  const dialog = $<HTMLDialogElement>('apply-dialog');
  $('apply-dialog-message').textContent = message;
  dialog.returnValue = ''; // Esc leaves the value from the last time it closed.
  dialog.showModal();
  return new Promise<boolean>((resolve) => {
    dialog.addEventListener('close', () => resolve(dialog.returnValue === 'apply'), { once: true });
  });
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

  // Set before asking: it also stops checkFile from swapping the session while the dialog is open.
  applying = true;
  try {
    if (pending && !(await confirmApply(`${plural(pending, 'undecided change')} will be reverted to the original. Apply to ${file.name} anyway?`))) return;
    const res = await applyMerged(mergeResult(getSegments(), state.decisions), file.revisedHash);
    if (res.ok) {
      openSession(res.data);
      showToast(`Applied to ${file.name}.${pending ? ` ${plural(pending, 'undecided change')} reverted.` : ''}`);
    } else if (res.status === 409) {
      setFileStale(true);
      showToast(`${file.name} changed since you loaded it. Nothing was written.`);
    } else {
      showToast(res.error);
    }
  } finally {
    applying = false;
  }
}

/** How often to check the file while the page is visible. The check only transfers two hashes. */
const POLL_MS = 2000;
let checking = false;

/**
 * File mode: notice when the file (or the original, after an apply from
 * another tab) changed. With no decisions to lose, show the new version right
 * away; otherwise flag it and let the reader choose when to reload.
 */
async function checkFile() {
  const { file } = state;
  if (!file || checking || applying) return;
  checking = true;
  try {
    const res = await fetchStatus();
    // Ignore errors (Apply reports them) and answers about a session that has since been replaced.
    if (!res.ok || state.file !== file) return;
    const changed = res.data.revisedHash !== file.revisedHash || res.data.originalHash !== file.originalHash;
    if (!changed) {
      setFileStale(false); // e.g. the edit was undone
      return;
    }
    const { accepted, rejected } = countDecisions(getSegments(), state.decisions);
    if (accepted + rejected) {
      setFileStale(true);
      return;
    }
    const session = await fetchSession();
    if (session.ok && state.file === file) {
      openSession(session.data);
      showToast(`${file.name} changed on disk. Showing the latest version.`);
    }
  } finally {
    checking = false;
  }
}

export function watchFile() {
  const check = () => {
    if (document.visibilityState === 'visible') void checkFile();
  };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
  window.setInterval(check, POLL_MS);
}
