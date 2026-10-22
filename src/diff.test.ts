import { describe, expect, it } from 'vitest';
import { buildSegments, changeIds, countDecisions, mergeResult, type Decisions } from './diff';

const all = (ids: number[], d: Decisions[number]): Decisions =>
  Object.fromEntries(ids.map((id) => [id, d]));

const samples: [string, string][] = [
  ['the quick brown fox\n\nHi there', 'a fast brown fox\nHi there!'],
  ['Hello world.', 'Hello world.'],
  ['', 'Brand new text.'],
  ['Delete me entirely.', ''],
  ['One  two\tthree\n\n\nfour', 'One two three\nfour five'],
  [
    'I think that this approach is good, but it could be better.',
    'This approach is solid, though it could be improved.',
  ],
  ['- One.\n- Three.', '- One.\n- Two.\n- Three.'],
  ['- One.\n- Two.\n- Three.', '- One.\n- Three.'],
  ['Intro.\nBody.', 'New first line.\nIntro.\nBody.'],
  ['Body.\nEnd.', 'Body.\nEnd.\nNew last line.'],
];

describe('buildSegments', () => {
  it('flags only the changed word', () => {
    const segs = buildSegments('The cat sat on the mat.', 'The dog sat on the mat.');
    const changes = segs.filter((s) => s.kind === 'change');
    expect(changes).toEqual([{ kind: 'change', id: 0, removed: 'cat', added: 'dog' }]);
  });

  it('merges adjacent changes separated only by spaces', () => {
    const segs = buildSegments('the quick brown fox', 'a fast brown fox');
    expect(segs[0]).toEqual({ kind: 'change', id: 0, removed: 'the quick', added: 'a fast' });
    expect(changeIds(segs)).toEqual([0]);
  });

  it('does not merge across a newline', () => {
    const segs = buildSegments('alpha\nbeta', 'ALPHA\nBETA');
    expect(changeIds(segs)).toEqual([0, 1]);
  });

  it('produces no changes for identical input', () => {
    expect(changeIds(buildSegments('same text', 'same text'))).toEqual([]);
    expect(buildSegments('', '')).toEqual([]);
  });

  it('assigns sequential ids', () => {
    const segs = buildSegments('a b c d e', 'a X c Y e');
    expect(changeIds(segs)).toEqual([0, 1]);
  });
});

describe('line alignment', () => {
  const changes = (a: string, b: string) => buildSegments(a, b).filter((s) => s.kind === 'change');

  it('aligns an inserted list item to whole lines', () => {
    const original = '- Accept all.\n- Copy the result with one click.';
    const revised = '- Accept all.\n- See progress.\n- Copy the result in one click.';
    expect(changes(original, revised)).toEqual([
      { kind: 'change', id: 0, removed: '', added: '- See progress.\n' },
      { kind: 'change', id: 1, removed: 'with', added: 'in' },
    ]);
  });

  it('aligns a deleted line to whole lines', () => {
    expect(changes('- One.\n- Two.\n- Three.', '- One.\n- Three.')).toEqual([
      { kind: 'change', id: 0, removed: '- Two.\n', added: '' },
    ]);
  });

  it('leaves single-line edits alone', () => {
    expect(changes('a b c', 'a b b c')).toHaveLength(1);
    expect(mergeResult(buildSegments('a b c', 'a b b c'), { 0: 'accepted' })).toBe('a b b c');
  });
});

describe('mergeResult', () => {
  it.each(samples)('round-trips %j -> %j', (original, revised) => {
    const segs = buildSegments(original, revised);
    const ids = changeIds(segs);
    expect(mergeResult(segs, {})).toBe(original);
    expect(mergeResult(segs, all(ids, 'rejected'))).toBe(original);
    expect(mergeResult(segs, all(ids, 'accepted'))).toBe(revised);
  });

  it('applies individual decisions', () => {
    const segs = buildSegments('a b c d e', 'a X c Y e');
    expect(mergeResult(segs, { 0: 'accepted' })).toBe('a X c d e');
    expect(mergeResult(segs, { 0: 'rejected', 1: 'accepted' })).toBe('a b c Y e');
  });
});

describe('countDecisions', () => {
  it('counts each state', () => {
    const segs = buildSegments('a b c d e f g', 'a X c Y e Z g');
    expect(countDecisions(segs, { 0: 'accepted', 2: 'rejected' })).toEqual({
      total: 3,
      accepted: 1,
      rejected: 1,
      pending: 1,
    });
  });
});
