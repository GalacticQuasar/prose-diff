import { countDecisions, decisionOf, type Decision, type Segment } from './diff';
import { $, el } from './dom';
import { applyMeasure } from './measure';
import { minimapWidth, renderMinimap, setMinimapShown } from './minimap';
import { decide, focus, getSegments, state } from './state';

const pasteView = $('paste-view');
const reviewView = $('review-view');
const doc = $('doc');
const page = reviewView.querySelector<HTMLElement>('.page')!;
const marks = $('marks');
const keys = page.querySelector<HTMLElement>('.keys')!;
const counts = $('counts');
const toolbar = reviewView.querySelector<HTMLElement>('.toolbar')!;
const actions = $('change-actions');
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
  // Keep clear of the minimap strip at the window's right edge.
  const viewportRight = document.documentElement.clientWidth - minimapWidth();

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

/** Reposition everything placed from measured layout. */
export function relayout() {
  if (state.view === 'review') {
    renderMarks();
    fitKeys();
    renderMinimap();
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
    setMinimapShown(false);
    if (lastView !== 'paste') {
      originalInput.value = state.original;
      revisedInput.value = state.revised;
      originalInput.focus();
    }
  } else {
    if (lastView !== 'review') hoverId = null;
    applyMeasure(state.measure);
    const segments = getSegments();
    const c = countDecisions(segments, state.decisions);
    counts.textContent = c.total ? `${c.total - c.pending} of ${c.total} decided` : 'No changes';
    // Before measuring anything: showing the minimap hides the scrollbar, which widens the view.
    setMinimapShown(c.total > 0);
    renderDoc(segments);
  }
  relayout();
  lastView = state.view;
}

export function scrollFocusedIntoView() {
  const target = doc.querySelector<HTMLElement>('.chg.focused');
  if (!target) return;
  // The visible area is what's below the sticky toolbar (its height varies when it wraps).
  const viewTop = toolbar.offsetHeight;
  const viewHeight = window.innerHeight - viewTop;
  const breathingRoom = Math.round(window.innerHeight * 0.15);
  const { top, bottom, height } = target.getBoundingClientRect();
  // Leave the view alone if the whole change is already comfortably visible (e.g. stepping between nearby changes).
  if (top >= viewTop + breathingRoom && bottom <= window.innerHeight - breathingRoom) return;
  // Center a change that fits; otherwise bring its start near the top so as much of it as possible shows below.
  const dest = height <= viewHeight ? viewTop + (viewHeight - height) / 2 : viewTop + breathingRoom;
  window.scrollTo({ top: window.scrollY + top - dest, behavior: 'smooth' });
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
    decide(Number(actions.dataset.id), btn.dataset.act as Decision);
  });

  window.addEventListener('resize', relayout);
  // Line breaks move once the web font replaces the fallback.
  void document.fonts.ready.then(relayout);
}
