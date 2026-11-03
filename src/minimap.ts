import { decisionOf } from './diff';
import { $, el } from './dom';
import { state } from './state';

const doc = $('doc');
const minimap = $('minimap');
const ticksLayer = minimap.querySelector<HTMLElement>('.ticks')!;
const viewport = minimap.querySelector<HTMLElement>('.viewport')!;

/** Strip pixels per document pixel; the strip maps the window's whole scroll range. */
const scale = () => minimap.clientHeight / document.documentElement.scrollHeight;

/** Width the strip takes from the window's right edge (0 while hidden). */
export const minimapWidth = () => (minimap.hidden ? 0 : minimap.offsetWidth);

/** Move the box for the visible part of the document. Cheap; runs on scroll. */
function positionViewport() {
  const s = scale();
  viewport.style.top = `${window.scrollY * s}px`;
  viewport.style.height = `${window.innerHeight * s}px`;
}

/** The minimap stands in for the window's scrollbar, so hide that while it shows. */
export function setMinimapShown(shown: boolean) {
  minimap.hidden = !shown;
  document.documentElement.classList.toggle('minimap-on', shown);
}

/** Overview strip at the window's edge: one tick per change, coloured by decision. */
export function renderMinimap() {
  if (minimap.hidden) return;
  const s = scale();
  const ticks: HTMLElement[] = [];
  for (const chg of doc.querySelectorAll<HTMLElement>('.chg')) {
    const rects = chg.getClientRects();
    if (!rects.length) continue;
    const top = (rects[0].top + window.scrollY) * s;
    const bottom = (rects[rects.length - 1].bottom + window.scrollY) * s;
    const id = Number(chg.dataset.id);
    const tick = el('div', `tick ${decisionOf(state.decisions, id)}`);
    if (id === state.focusedId) tick.classList.add('focused');
    tick.style.top = `${top}px`;
    tick.style.height = `${Math.max(3, bottom - top)}px`;
    ticks.push(tick);
  }
  ticksLayer.replaceChildren(...ticks);
  positionViewport();
}

export function bindMinimap() {
  let scrollFrame = 0;
  window.addEventListener('scroll', () => {
    if (scrollFrame) return;
    scrollFrame = requestAnimationFrame(() => {
      scrollFrame = 0;
      if (state.view === 'review') positionViewport();
    });
  });

  // The minimap works like a scrollbar: drag the viewport box to scroll, or
  // click elsewhere on the strip to centre the view there and keep dragging.
  // grab = where in the viewport box (strip px from its top) the pointer holds it.
  let grab: number | null = null;
  const scrollToPointer = (e: PointerEvent) => {
    const y = e.clientY - minimap.getBoundingClientRect().top - grab!;
    window.scrollTo({ top: y / scale(), behavior: 'instant' });
  };
  minimap.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const box = viewport.getBoundingClientRect();
    const onBox = e.clientY >= box.top && e.clientY <= box.bottom;
    grab = onBox ? e.clientY - box.top : box.height / 2;
    minimap.setPointerCapture(e.pointerId);
    if (!onBox) scrollToPointer(e);
  });
  minimap.addEventListener('pointermove', (e) => {
    if (grab !== null) scrollToPointer(e);
  });
  const endDrag = () => {
    grab = null;
  };
  minimap.addEventListener('pointerup', endDrag);
  minimap.addEventListener('pointercancel', endDrag);
}
