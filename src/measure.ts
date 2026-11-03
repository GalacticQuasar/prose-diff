import { $, el } from './dom';
import { MEASURE, setMeasure, state } from './state';
import { showToast } from './toast';

const reviewView = $('review-view');
const page = reviewView.querySelector<HTMLElement>('.page')!;
const doc = $('doc');
const resizer = $('page-resizer');

/** Show a line length on the page without committing it to state. */
export function applyMeasure(measure: number) {
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

/** Widen (positive) or narrow (negative) the page by some characters; returns the new measure. */
function stepMeasure(delta: number) {
  const { max } = pageGeometry();
  // A measure saved on a wider window may not fit here; start from what's shown.
  const measure = clampMeasure(Math.min(state.measure, max) + delta, max);
  setMeasure(measure);
  return measure;
}

export function adjustMeasure(delta: number) {
  showToast(`Line width: ${stepMeasure(delta)} characters`);
}

/**
 * Drag the page's right edge (or focus it and use ←/→) to change the line length.
 * `preview` relays out the page while a drag shows a measure not yet in state.
 */
export function bindResizer(preview: () => void) {
  resizer.setAttribute('aria-valuemin', String(MEASURE.min));
  resizer.setAttribute('aria-valuemax', String(MEASURE.max));

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
    preview();
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
      stepMeasure(deltas[e.key]);
    } else {
      return;
    }
    // Keep j/k/a/r and friends from also firing.
    e.stopPropagation();
  });
}
