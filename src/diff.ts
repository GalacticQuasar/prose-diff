import { diffLines, diffWordsWithSpace } from 'diff';

/**
 * Bump when a change to the diff could segment the same texts differently:
 * change ids are positional, so saved decisions from an older version would
 * land on the wrong changes.
 */
export const DIFF_VERSION = 2;

export type Decision = 'pending' | 'accepted' | 'rejected';
export type Decisions = Record<number, Decision>;

export type Segment =
  | { kind: 'same'; text: string }
  | { kind: 'change'; id: number; removed: string; added: string };

// Spaces or tabs only (no newline): changes separated by just this are merged
// into one hunk so "the quick" -> "a fast" is a single decision.
const JOINABLE_GAP = /^[ \t]{1,3}$/;

type Part = { value: string; added: boolean; removed: boolean };

const isSame = (p: Part | undefined) => !!p && !p.added && !p.removed;
const isLineStart = (before: string) => before === '' || before.endsWith('\n');

/**
 * A pure insertion/deletion between unchanged text can often be shifted
 * without changing its meaning, e.g. "…all.\n- [See more.\n- ]Copy…" is the
 * same edit as "…all.\n[- See more.\n]- Copy…". When the edit spans lines,
 * slide it (by the smallest amount) so it covers whole lines.
 */
function alignToLines(parts: Part[]): Part[] {
  const out = parts.map((p) => ({ ...p }));
  for (let i = 0; i < out.length; i++) {
    const part = out[i];
    if (isSame(part) || !part.value.includes('\n')) continue;
    const prev = isSame(out[i - 1]) ? out[i - 1] : undefined;
    const next = isSame(out[i + 1]) ? out[i + 1] : undefined;
    if ((i > 0 && !prev) || (i < out.length - 1 && !next)) continue; // not one-sided
    const before = prev?.value ?? '';
    const after = next?.value ?? '';
    const v = part.value;

    for (let k = 0; k < v.length; k++) {
      // Slide left by k: the last k chars of the edit must equal the last k
      // chars of the text before it.
      // (Sliding needs a neighbour on the far side to absorb the shifted text.)
      if ((k === 0 || next) && k <= before.length && before.endsWith(v.slice(v.length - k))) {
        const shifted = v.slice(v.length - k) + v.slice(0, v.length - k);
        const newBefore = before.slice(0, before.length - k);
        if (shifted.endsWith('\n') && isLineStart(newBefore)) {
          apply(prev, next, part, newBefore, shifted, v.slice(v.length - k) + after);
          break;
        }
      }
      // Slide right by k: the first k chars of the edit must equal the first
      // k chars of the text after it.
      if (k > 0 && prev && k <= after.length && after.startsWith(v.slice(0, k))) {
        const shifted = v.slice(k) + v.slice(0, k);
        const newBefore = before + v.slice(0, k);
        if (shifted.endsWith('\n') && isLineStart(newBefore)) {
          apply(prev, next, part, newBefore, shifted, after.slice(k));
          break;
        }
      }
    }
  }
  return out.filter((p) => p.value !== '');
}

function apply(prev: Part | undefined, next: Part | undefined, part: Part, before: string, value: string, after: string) {
  if (prev) prev.value = before;
  if (next) next.value = after;
  part.value = value;
}

/**
 * Word diffs cost roughly size × edits, so a long run of heavily edited lines
 * can take seconds. Past this many word edits, a block is shown as a single
 * replacement instead (about 300 ms worst case). A count rather than a timeout,
 * so the same texts always split the same way.
 */
export const MAX_WORD_EDITS = 2000;

/**
 * Diff by lines first, then by words only inside each block of changed lines.
 * This is much faster than one word diff over the whole text. It also keeps an
 * insertion in one piece: a whole-text word diff can match a few tokens of an
 * unchanged line (e.g. `\end{`) against copies inside the inserted text,
 * splitting it into several changes.
 */
function diffParts(original: string, revised: string): Part[] {
  const lines = diffLines(original, revised);
  const parts: Part[] = [];
  const push = (p: Part) => {
    const last = parts[parts.length - 1];
    if (last && last.added === p.added && last.removed === p.removed) last.value += p.value;
    else parts.push({ value: p.value, added: p.added, removed: p.removed });
  };

  for (let i = 0; i < lines.length; i++) {
    const p = lines[i];
    const q = lines[i + 1];
    if (p.removed && q?.added) {
      const words = diffWordsWithSpace(p.value, q.value, { maxEditLength: MAX_WORD_EDITS });
      (words ?? [p, q]).forEach(push);
      i++;
    } else {
      push(p);
    }
  }
  return parts;
}

export function buildSegments(original: string, revised: string): Segment[] {
  const parts = alignToLines(diffParts(original, revised));
  const out: Segment[] = [];

  for (const part of parts) {
    const last = out[out.length - 1];
    if (!part.added && !part.removed) {
      if (last?.kind === 'same') last.text += part.value;
      else out.push({ kind: 'same', text: part.value });
      continue;
    }

    let change: Extract<Segment, { kind: 'change' }>;
    if (last?.kind === 'change') {
      change = last;
    } else if (
      last?.kind === 'same' &&
      JOINABLE_GAP.test(last.text) &&
      out[out.length - 2]?.kind === 'change'
    ) {
      out.pop();
      change = out[out.length - 1] as Extract<Segment, { kind: 'change' }>;
      change.removed += last.text;
      change.added += last.text;
    } else {
      change = { kind: 'change', id: 0, removed: '', added: '' };
      out.push(change);
    }
    if (part.added) change.added += part.value;
    else change.removed += part.value;
  }

  let id = 0;
  for (const seg of out) if (seg.kind === 'change') seg.id = id++;
  return out;
}

export function changeIds(segments: Segment[]): number[] {
  return segments.flatMap((s) => (s.kind === 'change' ? [s.id] : []));
}

export function decisionOf(decisions: Decisions, id: number): Decision {
  return decisions[id] ?? 'pending';
}

/** Pending changes keep the original text. */
export function mergeResult(segments: Segment[], decisions: Decisions): string {
  return segments
    .map((s) =>
      s.kind === 'same' ? s.text : decisionOf(decisions, s.id) === 'accepted' ? s.added : s.removed,
    )
    .join('');
}

export function countDecisions(segments: Segment[], decisions: Decisions) {
  const counts = { total: 0, accepted: 0, rejected: 0, pending: 0 };
  for (const id of changeIds(segments)) {
    counts.total++;
    counts[decisionOf(decisions, id)]++;
  }
  return counts;
}
