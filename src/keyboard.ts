import { applyToFile, compareInputs, copyResult, nextRound } from './actions';
import { isFileMode } from './fileMode';
import { adjustMeasure } from './measure';
import { scrollFocusedIntoView } from './render';
import { MEASURE, decideFocused, focusEdge, focusStep, state } from './state';

export function bindKeyboard(help: HTMLDialogElement) {
  document.addEventListener('keydown', (e) => {
    if (help.open) return;
    const target = e.target as HTMLElement;
    const typing = target.matches('textarea, input, [contenteditable]');

    if (state.view === 'paste') {
      if (typing && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        compareInputs();
      }
      if (!typing && e.key === '?') help.showModal();
      return;
    }

    if (typing || e.ctrlKey || e.metaKey || e.altKey) return;
    // Let Enter activate a focused toolbar button as usual.
    if (e.key === 'Enter' && target instanceof HTMLButtonElement) return;

    const handlers: Record<string, () => void> = {
      j: () => focusStep(1),
      ArrowDown: () => focusStep(1),
      k: () => focusStep(-1),
      ArrowUp: () => focusStep(-1),
      g: () => focusEdge('first'),
      G: () => focusEdge('last'),
      a: () => decideFocused('accepted'),
      Enter: () => decideFocused('accepted'),
      r: () => decideFocused('rejected'),
      Backspace: () => decideFocused('rejected'),
      u: () => decideFocused('pending'),
      c: () => void copyResult(),
      // In file mode, applying starts the next round (the file is the revised text).
      ...(isFileMode ? { w: () => void applyToFile() } : { n: nextRound }),
      '[': () => adjustMeasure(-MEASURE.step),
      ']': () => adjustMeasure(MEASURE.step),
      '?': () => help.showModal(),
    };
    const handler = handlers[e.key];
    if (!handler) return;
    e.preventDefault();
    handler();
    scrollFocusedIntoView();
  });
}
