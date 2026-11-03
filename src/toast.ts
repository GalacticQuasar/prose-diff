import { $, el } from './dom';

const toast = $('toast');
let timer: number | undefined;

export function showToast(message: string, action?: { label: string; run: () => void }) {
  // Replaces any previous message and its button.
  toast.textContent = message;
  let btn: HTMLButtonElement | undefined;
  const hide = () => {
    toast.classList.remove('show');
    // The faded toast still sits in the page; keep Tab and Enter from reaching a stale action.
    if (btn) btn.disabled = true;
  };
  if (action) {
    btn = el('button', '', action.label) as HTMLButtonElement;
    btn.addEventListener('click', () => {
      hide();
      action.run();
    });
    toast.append(btn);
  }
  toast.classList.add('show');
  window.clearTimeout(timer);
  // Leave time to reach the action button.
  timer = window.setTimeout(hide, action ? 6000 : 1600);
}
