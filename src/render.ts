import { countDecisions, decisionOf, mergeResult, type Segment } from './diff';
import { MEASURE, continueFromResult, decide, focus, getSegments, setMeasure, state } from './state';

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

const pasteView = $('paste-view');
const reviewView = $('review-view');
const doc = $('doc');
const page = reviewView.querySelector<HTMLElement>('.page')!;
const marks = $('marks');
const keys = page.querySelector<HTMLElement>('.keys')!;
const resizer = $('page-resizer');
const counts = $('counts');
const toolbar = reviewView.querySelector<HTMLElement>('.toolbar')!;
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

/** "3 undecided changes kept as original." for toasts, or '' when all are decided. */
function keptNote(pending: number) {
  return pending ? ` ${pending} undecided change${pending === 1 ? '' : 's'} kept as original.` : '';
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
    span.title = 'Click to select, then a to accept or r to reject';
  } else {
    const text = decision === 'accepted' ? seg.added : seg.removed;
    // An accepted deletion or rejected insertion leaves nothing behind;
    // show a small marker so it can still be found and undone.
    span.append(text ? document.createTextNode(text) : el('span', 'empty-mark'));
    span.title = `${decision === 'accepted' ? 'Accepted' : 'Rejected'}. Click to undo.`;
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

const MARK_GLYPH = { pending: '•', accepted: '✓', rejected: '✗' } as const;

/** Editor's marks in the page margin: one row per text line that has changes. */
function renderMarks() {
  const pageTop = page.getBoundingClientRect().top;
  const rows = new Map<number, HTMLElement>();
  for (const chg of doc.querySelectorAll<HTMLElement>('.chg')) {
    const line = chg.getClientRects()[0];
    if (!line) continue;
    const top = Math.round(line.top - pageTop);
    // Changes on the same line can differ by a pixel or two in height; share a row.
    let row = [...rows.entries()].find(([t]) => Math.abs(t - top) < line.height / 2)?.[1];
    if (!row) {
      row = el('div', 'mark-row');
      row.style.top = `${top}px`;
      row.style.height = `${line.height}px`;
      rows.set(top, row);
    }
    const id = Number(chg.dataset.id);
    const decision = decisionOf(state.decisions, id);
    const mark = el('span', `mark ${decision}`, MARK_GLYPH[decision]);
    mark.dataset.id = String(id);
    if (id === state.focusedId) mark.classList.add('focused');
    row.append(mark);
  }
  marks.replaceChildren(...rows.values());
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
  const width = actions.offsetWidth;
  const pageRect = page.getBoundingClientRect();
  const viewportRight = document.documentElement.clientWidth;

  // Prefer the space to the right of the page, level with the change's
  // first line, so the text stays readable.
  if (pageRect.right + 8 + width <= viewportRight - 8) {
    const line = rects[0] ?? target.getBoundingClientRect();
    actions.style.left = `${pageRect.right + window.scrollX + 8}px`;
    actions.style.top = `${line.top + window.scrollY + (line.height - actions.offsetHeight) / 2}px`;
    return;
  }

  // Narrow viewport: no margin to use, so float just above the change.
  const rect = rects[rects.length - 1] ?? target.getBoundingClientRect();
  const left = Math.min(rect.right + window.scrollX - width, window.scrollX + viewportRight - width - 8);
  actions.style.left = `${Math.max(8, left)}px`;
  actions.style.top = `${rect.top + window.scrollY - actions.offsetHeight - 2}px`;
}

/** Hide the shortcut list when the page leaves no room for it on the left. */
function fitKeys() {
  page.classList.remove('no-keys');
  page.classList.toggle('no-keys', keys.getBoundingClientRect().left < 8);
}

/** Show a line length on the page without committing it to state. */
function applyMeasure(measure: number) {
  page.style.setProperty('--measure', String(measure));
  resizer.setAttribute('aria-valuenow', String(measure));
  resizer.querySelector<HTMLElement>('.grip')!.dataset.label = `${measure} ch`;
}

/** Character width and the page's padding + border, for converting widths to a measure. */
function pageGeometry() {
  const probe = el('span', 'ch-probe', '0'.repeat(100));
  page.append(probe);
  const ch = probe.getBoundingClientRect().width / 100;
  probe.remove();
  const chrome = page.offsetWidth - doc.clientWidth;
  // The widest measure that fits in the view.
  const fit = Math.floor((reviewView.clientWidth - chrome) / ch);
  return { ch, chrome, max: Math.max(MEASURE.min, Math.min(MEASURE.max, fit)) };
}

const clampMeasure = (measure: number, max: number) => Math.max(MEASURE.min, Math.min(max, Math.round(measure)));

/** Widen (positive) or narrow (negative) the page by some characters. */
export function adjustMeasure(delta: number) {
  const { max } = pageGeometry();
  // A measure saved on a wider window may not fit here; start from what's shown.
  const measure = clampMeasure(Math.min(state.measure, max) + delta, max);
  setMeasure(measure);
  showToast(`Line width: ${measure} characters`);
}

function relayout() {
  if (state.view === 'review') {
    renderMarks();
    fitKeys();
  }
  positionActions();
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
    applyMeasure(state.measure);
    const segments = getSegments();
    renderDoc(segments);
    renderMarks();
    fitKeys();
    const c = countDecisions(segments, state.decisions);
    counts.textContent = c.total ? `${c.total - c.pending} of ${c.total} decided` : 'No changes';
    if (lastView !== 'review') hoverId = null;
  }
  positionActions();
  lastView = state.view;
}

export function scrollFocusedIntoView() {
  const target = doc.querySelector<HTMLElement>('.chg.focused');
  if (!target) return;
  // Keep the change clear of the sticky toolbar (its height varies when it wraps) with some breathing room.
  const breathingRoom = Math.round(window.innerHeight * 0.15);
  target.style.scrollMarginTop = `${toolbar.offsetHeight + breathingRoom}px`;
  target.style.scrollMarginBottom = `${breathingRoom}px`;
  target.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
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
  showToast(`Result is the new original.${keptNote(pending)}`, {
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
  showToast(`Copied.${keptNote(pending)}`);
}

export function bindDocEvents() {
  const scheduleHide = () => {
    window.clearTimeout(hideTimer);
    hideTimer = window.setTimeout(() => {
      hoverId = null;
      positionActions();
    }, 600);
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
  marks.addEventListener('click', (e) => {
    const mark = (e.target as HTMLElement).closest<HTMLElement>('.mark');
    if (mark) focus(Number(mark.dataset.id));
  });

  actions.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest<HTMLButtonElement>('button[data-act]');
    if (!btn) return;
    hoverId = null;
    decide(Number(actions.dataset.id), btn.dataset.act as 'accepted' | 'rejected' | 'pending');
  });

  window.addEventListener('resize', relayout);
  // Line breaks move once the web font replaces the fallback.
  void document.fonts.ready.then(relayout);
}

/** Drag the page's right edge (or focus it and use ←/→) to change the line length. */
export function bindResizer() {
  let drag: (ReturnType<typeof pageGeometry> & { center: number; measure: number }) | null = null;

  resizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = page.getBoundingClientRect();
    drag = { ...pageGeometry(), center: rect.left + rect.width / 2, measure: state.measure };
    resizer.setPointerCapture(e.pointerId);
    page.classList.add('resizing');
  });
  resizer.addEventListener('pointermove', (e) => {
    if (!drag) return;
    // The page stays centred, so its width grows by twice the pointer's travel.
    const measure = clampMeasure((2 * (e.clientX - drag.center) - drag.chrome) / drag.ch, drag.max);
    if (measure === drag.measure) return;
    drag.measure = measure;
    applyMeasure(measure);
    relayout();
  });
  const endDrag = () => {
    if (!drag) return;
    const { measure } = drag;
    drag = null;
    page.classList.remove('resizing');
    setMeasure(measure);
  };
  resizer.addEventListener('pointerup', endDrag);
  resizer.addEventListener('pointercancel', endDrag);
  resizer.addEventListener('dblclick', () => setMeasure(MEASURE.default));

  resizer.addEventListener('keydown', (e) => {
    const deltas: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, PageDown: -MEASURE.step, PageUp: MEASURE.step };
    if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      setMeasure(e.key === 'Home' ? MEASURE.min : pageGeometry().max);
    } else if (e.key in deltas) {
      e.preventDefault();
      const { max } = pageGeometry();
      setMeasure(clampMeasure(Math.min(state.measure, max) + deltas[e.key], max));
    } else {
      return;
    }
    // Keep j/k/a/r and friends from also firing.
    e.stopPropagation();
  });
}
