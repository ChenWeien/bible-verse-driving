import { describe, expect, it } from 'vitest';
import psalm16 from '../../public/passages/psalm-16.json';
import index from '../../public/passages/index.json';
import {
  challengeOptions,
  parsePassage,
  parseVerseText,
  PassageError,
  stripMarkup,
  type RawPassage,
} from './passage';
import { excerptAroundBlank, tokensLength, verseTokens } from './verseDisplay';

const PSALM_16_ORIGINAL = [
  '（大衛的金詩。）神啊，求你保佑我，因為我投靠你。',
  '我的心哪，你曾對耶和華說：你是我的主；我的好處不在你以外。',
  '論到世上的聖民，他們又美又善，是我最喜悅的。',
  '以別神代替耶和華的（或譯：送禮物給別神的），他們的愁苦必加增；他們所澆奠的血我不獻上；我嘴唇也不提別神的名號。',
  '耶和華是我的產業，是我杯中的分；我所得的，你為我持守。',
  '用繩量給我的地界，坐落在佳美之處；我的產業實在美好。',
  '我必稱頌那指教我的耶和華；我的心腸在夜間也警戒我。',
  '我將耶和華常擺在我面前，因他在我右邊，我便不致搖動。',
  '因此，我的心歡喜，我的靈（原文是榮耀）快樂；我的肉身也要安然居住。',
  '因為你必不將我的靈魂撇在陰間，也不叫你的聖者見朽壞。',
  '你必將生命的道路指示我。在你面前有滿足的喜樂；在你右手中有永遠的福樂。',
];

function seeded(seed = 1): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

describe('default passage file (Psalm 16)', () => {
  const raw = psalm16 as RawPassage;

  it('is listed as the default in index.json', () => {
    expect(index.default).toBe('psalm-16');
    expect(index.passages.find((p) => p.id === 'psalm-16')?.file).toBe('psalm-16.json');
  });

  it('has all 11 verses with refs 16:1 to 16:11', () => {
    expect(raw.verses.map((v) => v.ref)).toEqual(
      Array.from({ length: 11 }, (_, i) => `16:${i + 1}`),
    );
  });

  it('reproduces the original text exactly when blank markup is removed', () => {
    expect(raw.verses.map((v) => stripMarkup(v.text))).toEqual(PSALM_16_ORIGINAL);
  });

  it('has about 2 blanks per verse, each with 2 distinct distractors', () => {
    const p = parsePassage(raw);
    for (let vi = 0; vi < p.verses.length; vi++) {
      const n = p.challenges.filter((c) => c.verseIndex === vi).length;
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
    }
    for (const c of p.challenges) {
      expect(c.distractors).toHaveLength(2);
      expect(new Set([c.answer, ...c.distractors]).size).toBe(3);
    }
    expect(p.verses.map((v) => v.plainText)).toEqual(PSALM_16_ORIGINAL);
  });
});

describe('parseVerseText', () => {
  it('splits text and blanks', () => {
    expect(parseVerseText('求你[保佑|離棄|審判]我')).toEqual([
      { kind: 'text', text: '求你' },
      { kind: 'blank', answer: '保佑', distractors: ['離棄', '審判'] },
      { kind: 'text', text: '我' },
    ]);
  });

  it('handles blanks at the edges and adjacent blanks', () => {
    const parts = parseVerseText('[甲|乙][丙|丁]');
    expect(parts.map((p) => p.kind)).toEqual(['blank', 'blank']);
  });

  it('rejects an empty correct word', () => {
    expect(() => parseVerseText('a[|b]c')).toThrow(PassageError);
  });

  it('rejects unbalanced brackets', () => {
    expect(() => parseVerseText('a[b|c')).toThrow(PassageError);
    expect(() => parseVerseText('a]b')).toThrow(PassageError);
  });

  it('drops distractors equal to the answer and duplicates', () => {
    const [blank] = parseVerseText('[主|主|僕|僕]');
    expect(blank).toEqual({ kind: 'blank', answer: '主', distractors: ['僕'] });
  });
});

describe('parsePassage', () => {
  it('fills missing distractors from other blank words', () => {
    const p = parsePassage(
      {
        id: 't',
        title: 'T',
        verses: [
          { ref: '1', text: '[信心]和[盼望]' },
          { ref: '2', text: '還有[愛心|恨惡]' },
        ],
      },
      seeded(3),
    );
    expect(p.challenges.map((c) => c.answer)).toEqual(['信心', '盼望', '愛心']);
    for (const c of p.challenges) {
      expect(c.distractors).toHaveLength(2);
      expect(c.distractors).not.toContain(c.answer);
    }
    expect(p.challenges[2].distractors[0]).toBe('恨惡');
  });

  it('requires at least one blank', () => {
    expect(() => parsePassage({ id: 'x', title: 'x', verses: [{ ref: '1', text: 'no blanks' }] })).toThrow(
      PassageError,
    );
  });

  it('challengeOptions returns the answer plus 2 distractors', () => {
    const p = parsePassage(psalm16 as RawPassage);
    const opts = challengeOptions(p.challenges[0], seeded(7));
    expect([...opts].sort()).toEqual(['保佑', '審判', '離棄'].sort());
  });
});

describe('verse display', () => {
  const p = parsePassage(psalm16 as RawPassage);

  it('marks filled, current and future blanks', () => {
    const v = p.verses[0];
    const tokens = verseTokens(v, p, 1);
    expect(tokens.filter((t) => t.kind !== 'text')).toEqual([
      { text: '保佑', kind: 'filled' },
      { text: '＿＿', kind: 'current' },
    ]);
  });

  it('keeps short verses whole', () => {
    const first = p.challenges.find((c) => c.verseIndex === 4)!;
    const tokens = verseTokens(p.verses[4], p, first.index);
    expect(excerptAroundBlank(tokens, 40)).toEqual(tokens);
  });

  it('excerpts the clause around the blank in long verses', () => {
    const vi = 3; // 16:4, the longest verse
    const second = p.challenges.filter((c) => c.verseIndex === vi)[1];
    const tokens = verseTokens(p.verses[vi], p, second.index);
    const ex = excerptAroundBlank(tokens, 24);
    expect(tokensLength(ex)).toBeLessThan(tokensLength(tokens));
    expect(ex.some((t) => t.kind === 'current')).toBe(true);
    expect(ex[0]).toEqual({ text: '…', kind: 'ellipsis' });
    const text = ex.map((t) => t.text).join('');
    expect(text).toContain('我嘴唇也不提別神的＿＿。');
  });

  it('falls back to minor clauses when one sentence is too long', () => {
    const vi = 3;
    const first = p.challenges.filter((c) => c.verseIndex === vi)[0];
    const tokens = verseTokens(p.verses[vi], p, first.index);
    const ex = excerptAroundBlank(tokens, 16);
    const text = ex.map((t) => t.text).join('');
    expect(text).toContain('他們的＿＿必加增；');
    expect(tokensLength(ex)).toBeLessThanOrEqual(16 + 2);
  });
});
