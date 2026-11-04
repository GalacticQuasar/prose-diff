import { buildSegments, changeIds, changesKey, decisionOf, mergeResult, type Decision, type Decisions, type Segment } from './diff';
import { isFileMode, type Session } from './fileMode';

export type Theme = 'light' | 'dark' | null; // null = follow system

/** The file under review in file mode. */
export interface FileInfo {
  path: string;
  name: string;
  /** Echoed back on apply so the server can refuse if the file changed since. */
  revisedHash: string;
}

export interface State {
  view: 'paste' | 'review';
  original: string;
  revised: string;
  /** Inputs edited since the last Compare, so decisions no longer line up. */
  dirty: boolean;
  decisions: Decisions;
  focusedId: number | null;
  theme: Theme;
  /** Line length of the review page, in characters. */
  measure: number;
  /** `changesKey` of the changes `decisions` refer to. */
  decisionsKey: string;
  /** File mode only: the file being reviewed, once its session has loaded. */
  file: FileInfo | null;
  /** File mode only: why the session couldn't be loaded. */
  fileError: string | null;
}

export const MEASURE = { default: 65, min: 30, max: 120, step: 5 };

const STORAGE_KEY = 'prose-diff:v1';
/**
 * File mode keeps its decisions per tab, so it never overwrites the pasted
 * texts saved under STORAGE_KEY; only theme and page width are shared.
 */
const FILE_KEY = 'prose-diff:file';

const initial: State = {
  view: 'paste',
  original: '',
  revised: '',
  dirty: false,
  decisions: {},
  focusedId: null,
  theme: null,
  measure: MEASURE.default,
  decisionsKey: '',
  file: null,
  fileError: null,
};

function read(storage: Storage, key: string): Partial<State> {
  try {
    return JSON.parse(storage.getItem(key) ?? '{}') ?? {};
  } catch {
    // Corrupt or unavailable storage: start fresh.
    return {};
  }
}

function load(): State {
  const saved = read(localStorage, STORAGE_KEY);
  if (!isFileMode) return { ...initial, ...saved, file: null, fileError: null };
  // The texts come from the server (see openSession); until then show review with no changes.
  const { decisions, decisionsKey, focusedId } = { ...initial, ...read(sessionStorage, FILE_KEY) };
  const { theme, measure } = { ...initial, ...saved };
  return { ...initial, view: 'review', theme, measure, decisions, decisionsKey, focusedId };
}

export let state: State = load();
let segments: Segment[] = [];
let ids: number[] = [];

/** Rebuild the diff; returns its `changesKey`. */
function rebuild(original: string, revised: string) {
  segments = buildSegments(original, revised);
  ids = changeIds(segments);
  return changesKey(segments);
}

if (state.view === 'review' && !isFileMode) {
  const key = rebuild(state.original, state.revised);
  // Saved decisions from a diff that split the texts differently would land on the wrong changes.
  if (key !== state.decisionsKey) state = { ...state, decisions: {}, focusedId: null, decisionsKey: key };
}

const listeners = new Set<() => void>();

export function subscribe(fn: () => void) {
  listeners.add(fn);
}

export function getSegments() {
  return segments;
}

function persist() {
  try {
    if (isFileMode) {
      const { decisions, decisionsKey, focusedId, theme, measure } = state;
      sessionStorage.setItem(FILE_KEY, JSON.stringify({ decisions, decisionsKey, focusedId }));
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...read(localStorage, STORAGE_KEY), theme, measure }));
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, file: null, fileError: null }));
    }
  } catch {
    // Quota exceeded or storage disabled: keep working in memory.
  }
}

function update(patch: Partial<State>) {
  state = { ...state, ...patch };
  persist();
  listeners.forEach((fn) => fn());
}

export function setInputs(original: string, revised: string) {
  // Typing shouldn't re-render the whole app; just persist.
  state = { ...state, original, revised, dirty: true };
  persist();
}

/** Switch to review. Returns false (and does nothing) when both inputs are empty. */
export function compare(): boolean {
  if (!state.original && !state.revised) return false;
  const key = rebuild(state.original, state.revised);
  const decisions = state.dirty || key !== state.decisionsKey ? {} : state.decisions;
  update({ view: 'review', dirty: false, decisions, decisionsKey: key, focusedId: firstPending(decisions) ?? ids[0] ?? null });
  return true;
}

/**
 * File mode: show the file's session. Decisions survive (e.g. a refresh) only
 * while the diff splits into the same changes.
 */
export function openSession(session: Session) {
  const { path, name, original, revised, revisedHash } = session;
  const key = rebuild(original, revised);
  const keep = key === state.decisionsKey;
  const decisions = keep ? state.decisions : {};
  const focusedId =
    keep && state.focusedId !== null && ids.includes(state.focusedId) ? state.focusedId : (firstPending(decisions) ?? ids[0] ?? null);
  update({
    view: 'review',
    original,
    revised,
    dirty: false,
    decisions,
    decisionsKey: key,
    focusedId,
    file: { path, name, revisedHash },
    fileError: null,
  });
}

export function setFileError(fileError: string) {
  update({ fileError });
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
    const decisionsKey = rebuild(original, revised);
    update({ view: 'review', original, revised, dirty: false, decisions, decisionsKey, focusedId });
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

export function focusEdge(edge: 'first' | 'last') {
  if (ids.length) focus(edge === 'first' ? ids[0] : ids[ids.length - 1]);
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

/** Flip between light and dark, dropping the override when it matches the system again. */
export function toggleTheme() {
  const system = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  const next = (state.theme ?? system) === 'dark' ? 'light' : 'dark';
  update({ theme: next === system ? null : next });
}

export function setMeasure(measure: number) {
  if (measure !== state.measure) update({ measure });
}

export const decideFocused = (d: Decision) => decide(state.focusedId, d);
