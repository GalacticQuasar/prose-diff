import { copyResult, scrollFocusedIntoView } from './render';
import { acceptAll, compare, decideFocused, focusStep, rejectAll, state } from './state';

export function bindKeyboard(help: HTMLDialogElement) {
  document.addEventListener('keydown', (e) => {
    if (help.open) return;
    const target = e.target as HTMLElement;
    const typing = target.matches('textarea, input, [contenteditable]');

    if (state.view === 'paste') {
      if (typing && e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        compare();
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
      a: () => decideFocused('accepted'),
      Enter: () => decideFocused('accepted'),
      r: () => decideFocused('rejected'),
      Backspace: () => decideFocused('rejected'),
      u: () => decideFocused('pending'),
      A: acceptAll,
      R: rejectAll,
      c: () => void copyResult(),
      '?': () => help.showModal(),
    };
    const handler = handlers[e.key];
    if (!handler) return;
    e.preventDefault();
    handler();
    scrollFocusedIntoView();
  });
}
