import { countDecisions, decisionOf, mergeResult, type Segment } from './diff';
import { continueFromResult, decide, focus, getSegments, state } from './state';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const pasteView = $('paste-view');
const reviewView = $('review-view');
const doc = $('doc');
const counts = $('counts');
const actions = $('change-actions');
const toast = $('toast');
export const originalInput = $<HTMLTextAreaElement>('original');
export const revisedInput = $<HTMLTextAreaElement>('revised');

let lastView: string | null = null;
let hoverId: number | null = null;
let hideTimer: number | undefined;

/** Make whitespace-only and newline edits visible inside del/ins. */
function visible(text: string): string {
  if (/^[ \t]+$/.test(text)) return text.replace(/ /g, '·').replace(/\t/g, '→');
  return text.replace(/\n/g, '¶\n');
}

function el(tag: string, className: string, text?: string) {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function renderChange(seg: Extract<Segment, { kind: 'change' }>) {
  const decision = decisionOf(state.decisions, seg.id);
  const span = el('span', `chg ${decision}`);
  span.dataset.id = String(seg.id);
  if (seg.id === state.focusedId) span.classList.add('focused');

  if (decision === 'pending') {
    if (seg.removed) span.append(el('del', '', visible(seg.removed)));
    if (seg.added) span.append(el('ins', '', visible(seg.added)));
    span.title = 'Click to select · a accept · r reject';
  } else {
    const text = decision === 'accepted' ? seg.added : seg.removed;
    // An accepted deletion or rejected insertion leaves nothing behind;
    // show a small marker so it can still be found and undone.
    span.append(text ? document.createTextNode(text) : el('span', 'empty-mark'));
    span.title = `${decision === 'accepted' ? 'Accepted' : 'Rejected'} · click to undo`;
  }
  return span;
}

function renderDoc(segments: Segment[]) {
  if (!segments.some((s) => s.kind === 'change')) {
    doc.replaceChildren(el('p', 'empty', 'No differences — the two texts are identical.'));
    return;
  }
  doc.replaceChildren(
    ...segments.map((s) => (s.kind === 'same' ? document.createTextNode(s.text) : renderChange(s))),
  );
}

function positionActions() {
  const id = hoverId ?? state.focusedId;
  const target = id === null ? null : doc.querySelector<HTMLElement>(`.chg[data-id="${id}"]`);
  if (state.view !== 'review' || !target) {
    actions.hidden = true;
    return;
  }
  const decision = decisionOf(state.decisions, id!);
  actions.dataset.id = String(id);
  actions.dataset.decision = decision;
  actions.hidden = false;

  const rects = target.getClientRects();
  const rect = rects[rects.length - 1] ?? target.getBoundingClientRect();
  const width = actions.offsetWidth;
  const left = Math.min(rect.right + window.scrollX - width, window.scrollX + document.documentElement.clientWidth - width - 8);
  actions.style.left = `${Math.max(8, left)}px`;
  actions.style.top = `${rect.top + window.scrollY - actions.offsetHeight - 2}px`;
}

function applyTheme() {
  const root = document.documentElement;
  if (state.theme) root.dataset.theme = state.theme;
  else delete root.dataset.theme;
}

export function render() {
  applyTheme();
  pasteView.hidden = state.view !== 'paste';
  reviewView.hidden = state.view !== 'review';

  if (state.view === 'paste') {
    if (lastView !== 'paste') {
      originalInput.value = state.original;
      revisedInput.value = state.revised;
      originalInput.focus();
    }
  } else {
    const segments = getSegments();
    renderDoc(segments);
    const c = countDecisions(segments, state.decisions);
    counts.textContent = `${c.total} change${c.total === 1 ? '' : 's'} · ${c.accepted} accepted · ${c.rejected} rejected · ${c.pending} pending`;
    if (lastView !== 'review') hoverId = null;
  }
  positionActions();
  lastView = state.view;
}

export function scrollFocusedIntoView() {
  doc.querySelector('.chg.focused')?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
}

export function showToast(message: string, action?: { label: string; run: () => void }) {
  const hide = () => toast.classList.remove('show');
  toast.textContent = message;
  if (action) {
    const btn = el('button', '', action.label);
    btn.addEventListener('click', () => {
      hide();
      action.run();
    });
    toast.append(btn);
  }
  toast.classList.add('show');
  window.clearTimeout(Number(toast.dataset.timer));
  // Leave time to reach the action button.
  toast.dataset.timer = String(window.setTimeout(hide, action ? 6000 : 1600));
}

export function nextRound() {
  const pending = countDecisions(getSegments(), state.decisions).pending;
  const restore = continueFromResult();
  revisedInput.focus();
  showToast(pending ? `Result is the new original · ${pending} pending kept as original` : 'Result is the new original', {
    label: 'Undo',
    run: restore,
  });
}

export async function copyResult() {
  const text = mergeResult(getSegments(), state.decisions);
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API is unavailable on non-secure origins; fall back.
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
  }
  const pending = countDecisions(getSegments(), state.decisions).pending;
  showToast(pending ? `Copied · ${pending} pending kept as original` : 'Copied');
}

export function bindDocEvents() {
  const scheduleHide = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      hoverId = null;
      positionActions();
    }, 250);
  };

  doc.addEventListener('mouseover', (e) => {
    const chg = (e.target as HTMLElement).closest<HTMLElement>('.chg');
    if (!chg) return;
    window.clearTimeout(hideTimer);
    hoverId = Number(chg.dataset.id);
    positionActions();
  });
  doc.addEventListener('mouseout', (e) => {
    if ((e.target as HTMLElement).closest('.chg')) scheduleHide();
  });
  actions.addEventListener('mouseenter', () => window.clearTimeout(hideTimer));
  actions.addEventListener('mouseleave', scheduleHide);

  doc.addEventListener('click', (e) => {
    const chg = (e.target as HTMLElement).closest<HTMLElement>('.chg');
    if (chg) focus(Number(chg.dataset.id));
  });

  actions.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn) return;
    hoverId = null;
    decide(Number(actions.dataset.id), btn.dataset.act as 'accepted' | 'rejected' | 'pending');
  });

  window.addEventListener('resize', positionActions);
}
