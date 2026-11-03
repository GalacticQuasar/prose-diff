import { countDecisions, mergeResult } from './diff';
import { revisedInput } from './render';
import { compare, continueFromResult, getSegments, state } from './state';
import { showToast } from './toast';

/** " 3 undecided changes kept as original." for toasts, or '' when all are decided. */
function keptNote() {
  const { pending } = countDecisions(getSegments(), state.decisions);
  return pending ? ` ${pending} undecided change${pending === 1 ? '' : 's'} kept as original.` : '';
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
