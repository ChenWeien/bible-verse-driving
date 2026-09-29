import { describe, expect, it } from 'vitest';
import { layoutRuns } from './textTexture';

const measure = (t: string) => [...t].length * 10;
const join = (lines: { text: string }[][]) => lines.map((l) => l.map((r) => r.text).join(''));

describe('layoutRuns', () => {
  it('wraps CJK text by character', () => {
    expect(join(layoutRuns([{ text: '一二三四五六七' }], measure, 30))).toEqual(['一二三', '四五六', '七']);
  });

  it('keeps atomic runs together', () => {
    const lines = layoutRuns([{ text: '一二' }, { text: '＿＿', atomic: true }, { text: '三' }], measure, 30);
    expect(join(lines)).toEqual(['一二', '＿＿三']);
  });

  it('does not start a line with punctuation', () => {
    expect(join(layoutRuns([{ text: '一二三，四' }], measure, 30))).toEqual(['一二', '三，四']);
  });

  it('merges pieces of the same run and preserves styling', () => {
    const lines = layoutRuns([{ text: '一二', color: 'red' }, { text: '三', color: 'blue' }], measure, 100);
    expect(lines).toEqual([[{ text: '一二', color: 'red' }, { text: '三', color: 'blue' }]]);
  });
});
