import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import './style.css';
import { bindKeyboard } from './keyboard';
import { bindDocEvents, copyResult, nextRound, originalInput, render, revisedInput, showToast } from './render';
import { acceptAll, compare, editInputs, rejectAll, resetAll, setInputs, setTheme, state, subscribe } from './state';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const help = $<HTMLDialogElement>('help');

const onInput = () => setInputs(originalInput.value, revisedInput.value);
originalInput.addEventListener('input', onInput);
revisedInput.addEventListener('input', onInput);

$('compare-btn').addEventListener('click', () => {
  if (!originalInput.value && !revisedInput.value) return showToast('Paste some text first');
  compare();
});
$('edit-btn').addEventListener('click', editInputs);
$('reset-btn').addEventListener('click', resetAll);
$('accept-all-btn').addEventListener('click', acceptAll);
$('reject-all-btn').addEventListener('click', rejectAll);
$('copy-btn').addEventListener('click', () => void copyResult());
$('continue-btn').addEventListener('click', nextRound);
$('help-btn').addEventListener('click', () => help.showModal());
$('theme-btn').addEventListener('click', () => {
  const systemDark = matchMedia('(prefers-color-scheme: dark)').matches;
  const current = state.theme ?? (systemDark ? 'dark' : 'light');
  const next = current === 'dark' ? 'light' : 'dark';
  // Drop the override when it matches the system again.
  setTheme(next === (systemDark ? 'dark' : 'light') ? null : next);
});

// Mouse clicks shouldn't leave a button focused, or Enter would re-trigger it
// instead of accepting the focused change.
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (btn && e.detail > 0) btn.blur();
});

bindDocEvents();
bindKeyboard(help);
subscribe(render);
render();
