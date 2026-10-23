import { buildSegments, changeIds, decisionOf, mergeResult, type Decision, type Decisions, type Segment } from './diff';

export type Theme = 'light' | 'dark' | null; // null = follow system

export interface State {
  view: 'paste' | 'review';
  original: string;
  revised: string;
  /** Inputs edited since the last Compare, so decisions no longer line up. */
  dirty: boolean;
  decisions: Decisions;
  focusedId: number | null;
  theme: Theme;
}

const STORAGE_KEY = 'prose-diff:v1';

const initial: State = {
  view: 'paste',
  original: '',
  revised: '',
  dirty: false,
  decisions: {},
  focusedId: null,
  theme: null,
};

function load(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return { ...initial, ...JSON.parse(raw) };
  } catch {
    // Corrupt or unavailable storage: start fresh.
  }
  return { ...initial };
}

export let state: State = load();
let segments: Segment[] = state.view === 'review' ? buildSegments(state.original, state.revised) : [];
let ids = changeIds(segments);

const listeners = new Set<() => void>();

export function subscribe(fn: () => void) {
  listeners.add(fn);
}

export function getSegments() {
  return segments;
}

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Quota exceeded or storage disabled: keep working in memory.
  }
  listeners.forEach((fn) => fn());
}

export function setInputs(original: string, revised: string) {
  // Typing shouldn't re-render the whole app; just persist.
  state = { ...state, original, revised, dirty: true };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function compare() {
  segments = buildSegments(state.original, state.revised);
  ids = changeIds(segments);
  const decisions = state.dirty ? {} : state.decisions;
  update({ view: 'review', dirty: false, decisions, focusedId: firstPending(decisions) ?? ids[0] ?? null });
}

export function editInputs() {
  update({ view: 'paste' });
}

/**
 * Start the next round: the merged result becomes the new original and the
 * revised box is cleared. Returns a function that restores the previous round.
 */
export function continueFromResult() {
  const { original, revised, decisions, focusedId } = state;
  update({ view: 'paste', original: mergeResult(segments, decisions), revised: '', dirty: false, decisions: {}, focusedId: null });
  return () => {
    segments = buildSegments(original, revised);
    ids = changeIds(segments);
    update({ view: 'review', original, revised, dirty: false, decisions, focusedId });
  };
}

function setAll(d: Decision) {
  update({ decisions: Object.fromEntries(ids.map((id) => [id, d])) });
}

export const acceptAll = () => setAll('accepted');
export const rejectAll = () => setAll('rejected');
export const resetAll = () => update({ decisions: {} });

export function focus(id: number | null) {
  if (id !== state.focusedId) update({ focusedId: id });
}

export function focusStep(delta: 1 | -1) {
  if (!ids.length) return;
  const i = state.focusedId === null ? -1 : ids.indexOf(state.focusedId);
  const next = i === -1 ? (delta === 1 ? 0 : ids.length - 1) : Math.min(ids.length - 1, Math.max(0, i + delta));
  focus(ids[next]);
}

function firstPending(decisions: Decisions, after = -1): number | null {
  const ordered = [...ids.filter((id) => id > after), ...ids.filter((id) => id <= after)];
  return ordered.find((id) => decisionOf(decisions, id) === 'pending') ?? null;
}

/** Decide a change, then focus the next pending one (undo keeps focus). */
export function decide(id: number | null, d: Decision) {
  if (id === null) return;
  const decisions = { ...state.decisions, [id]: d };
  const next = d === 'pending' ? id : (firstPending(decisions, id) ?? id);
  update({ decisions, focusedId: next });
}

export function setTheme(theme: Theme) {
  update({ theme });
}

export const decideFocused = (d: Decision) => decide(state.focusedId, d);
