import '@fontsource/courier-prime/400.css';
import '@fontsource/courier-prime/700.css';
import './style.css';
import { applyToFile, compareInputs, copyResult, loadFile, nextRound, reloadFile, watchFile } from './actions';
import { $ } from './dom';
import { isFileMode } from './fileMode';
import { bindKeyboard } from './keyboard';
import { bindResizer } from './measure';
import { bindMinimap } from './minimap';
import { bindDocEvents, originalInput, relayout, render, revisedInput } from './render';
import { acceptAll, editInputs, rejectAll, resetAll, setInputs, subscribe, toggleTheme } from './state';

const help = $<HTMLDialogElement>('help');

const onInput = () => setInputs(originalInput.value, revisedInput.value);
originalInput.addEventListener('input', onInput);
revisedInput.addEventListener('input', onInput);

$('compare-btn').addEventListener('click', compareInputs);
$('edit-btn').addEventListener('click', editInputs);
$('reset-btn').addEventListener('click', resetAll);
$('accept-all-btn').addEventListener('click', acceptAll);
$('reject-all-btn').addEventListener('click', rejectAll);
$('copy-btn').addEventListener('click', () => void copyResult());
$('continue-btn').addEventListener('click', nextRound);
$('apply-btn').addEventListener('click', () => void applyToFile());
$('reload-btn').addEventListener('click', () => void reloadFile());
$('help-btn').addEventListener('click', () => help.showModal());
$('theme-btn').addEventListener('click', toggleTheme);

// Mouse clicks shouldn't leave a button focused, or Enter would re-trigger it
// instead of accepting the focused change.
document.addEventListener('click', (e) => {
  const btn = (e.target as HTMLElement).closest('button');
  if (btn && e.detail > 0) btn.blur();
});

bindDocEvents();
bindMinimap();
bindResizer(relayout);
bindKeyboard(help);
if (isFileMode) {
  document.documentElement.classList.add('file-mode');
  // Apply is the main action here; Copy stays available as a secondary one.
  $('copy-btn').classList.remove('primary');
}
subscribe(render);
render();
if (isFileMode) void loadFile().then(watchFile);
