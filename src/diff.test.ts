import { describe, expect, it } from 'vitest';
import { MAX_WORD_EDITS, buildSegments, changeIds, changesKey, countDecisions, mergeResult, type Decisions } from './diff';

const changes = (a: string, b: string) => buildSegments(a, b).filter((s) => s.kind === 'change');

const all = (ids: number[], d: Decisions[number]): Decisions =>
  Object.fromEntries(ids.map((id) => [id, d]));

// An empty answer box, then filled in with text that also contains `\end{`.
const ANSWER_BOX = '\\begin{tcolorbox}\n\\end{tcolorbox}\n';
const FILLED_IN = '    \\item The loss uses the end-of-epoch weights.\n\\end{itemize}\n';
const ANSWER_BOX_FILLED = '\\begin{tcolorbox}\n' + FILLED_IN + '\\end{tcolorbox}\n';

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
  [ANSWER_BOX, ANSWER_BOX_FILLED],
];

describe('buildSegments', () => {
  it('flags only the changed word', () => {
    expect(changes('The cat sat on the mat.', 'The dog sat on the mat.')).toEqual([{ kind: 'change', id: 0, removed: 'cat', added: 'dog' }]);
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

describe('line-first diffing', () => {

  it('keeps an insertion before an unchanged line in one piece', () => {
    expect(changes(ANSWER_BOX, ANSWER_BOX_FILLED)).toEqual([
      { kind: 'change', id: 0, removed: '', added: FILLED_IN },
    ]);
  });

  it('still flags only the changed word inside a changed line', () => {
    expect(changes('One.\nThe cat sat.\nThree.', 'One.\nThe dog sat.\nThree.')).toEqual([
      { kind: 'change', id: 0, removed: 'cat', added: 'dog' },
    ]);
  });

  it('splits edits at an unchanged line between them', () => {
    expect(changeIds(buildSegments('A b c.\n\nD e f.', 'A x c.\n\nD y f.'))).toEqual([0, 1]);
  });

  it(`shows a block needing more than ${MAX_WORD_EDITS} word edits as one replacement`, () => {
    const words = (prefix: string) =>
      Array.from({ length: 40 }, (_, line) =>
        Array.from({ length: 30 }, (_, w) => `${prefix}${line}_${w}`).join(' '),
      ).join('\n') + '\n';
    const original = 'Intro.\n' + words('old') + 'Outro.\n';
    const revised = 'Intro.\n' + words('new') + 'Outro.\n';
    expect(changes(original, revised)).toEqual([
      { kind: 'change', id: 0, removed: words('old'), added: words('new') },
    ]);
    expect(mergeResult(buildSegments(original, revised), { 0: 'accepted' })).toBe(revised);
  });
});

describe('changesKey', () => {
  const key = (a: string, b: string) => changesKey(buildSegments(a, b));

  it('stays the same when only unchanged text differs', () => {
    expect(key('The cat sat.', 'The dog sat.')).toBe(key('A cat ran.', 'A dog ran.'));
  });

  it('changes when the texts split into different changes', () => {
    expect(key('a b c', 'a X c')).not.toBe(key('a b c', 'a Y c'));
    expect(key('a b c d e', 'a X c Y e')).not.toBe(key('a b c d e', 'a X Y d e'));
    // Same text overall, split differently between removed and added.
    expect(key('ab', 'c')).not.toBe(key('a', 'bc'));
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
