import { describe, expect, it } from 'vitest';
import psalm1 from '../../public/passages/psalm-1.json';
import psalm8 from '../../public/passages/psalm-8.json';
import psalm20 from '../../public/passages/psalm-20.json';
import psalm100 from '../../public/passages/psalm-100.json';
import psalm23 from '../../public/passages/psalm-23.json';
import psalm16 from '../../public/passages/psalm-16.json';
import index from '../../public/passages/index.json';
import {
  challengeOptions,
  parsePassage,
  parseVerseText,
  PassageError,
  stripMarkup,
  assertZhuyin,
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

const PSALM_1_ORIGINAL = [
  '不從惡人的計謀，不站罪人的道路，不坐褻慢人的座位，',
  '惟喜愛耶和華的律法，晝夜思想，這人便為有福！',
  '他要像一棵樹栽在溪水旁，按時候結果子，葉子也不枯乾。凡他所做的盡都順利。',
  '惡人並不是這樣，乃像糠粃被風吹散。',
  '因此，當審判的時候惡人必站立不住；罪人在義人的會中也是如此。',
  '因為耶和華知道義人的道路；惡人的道路卻必滅亡。',
];

describe('Psalm 1 passage file', () => {
  const raw = psalm1 as RawPassage;

  it('is listed in index.json', () => {
    expect(index.passages.find((p) => p.id === 'psalm-1')?.file).toBe('psalm-1.json');
  });

  it('has verses 1:1 to 1:6', () => {
    expect(raw.verses.map((v) => v.ref)).toEqual(Array.from({ length: 6 }, (_, i) => `1:${i + 1}`));
  });

  it('reproduces the original text exactly when blank markup is removed', () => {
    expect(raw.verses.map((v) => stripMarkup(v.text))).toEqual(PSALM_1_ORIGINAL);
    const p = parsePassage(raw);
    expect(p.verses.map((v) => v.plainText)).toEqual(PSALM_1_ORIGINAL);
    expect(p.challenges.length).toBeGreaterThanOrEqual(12);
    for (const c of p.challenges) {
      expect(c.distractors).toHaveLength(2);
      expect(new Set([c.answer, ...c.distractors]).size).toBe(3);
    }
  });
});

const PSALM_8_ORIGINAL = [
  '耶和華─我們的主啊，你的名在全地何其美！你將你的榮耀彰顯於天。',
  '你因敵人的緣故，從嬰孩和吃奶的口中，建立了能力，使仇敵和報仇的閉口無言。',
  '我觀看你指頭所造的天，並你所陳設的月亮星宿，',
  '便說：人算什麼，你竟顧念他？世人算什麼，你竟眷顧他？',
  '你叫他比天使（或譯：神）微小一點，並賜他榮耀尊貴為冠冕。',
  '你派他管理你手所造的，使萬物，就是一切的牛羊、田野的獸、空中的鳥、海裡的魚，凡經行海道的，都服在他的腳下。',
  '耶和華─我們的主啊，你的名在全地何其美！',
];

describe('Psalm 8 passage file', () => {
  const raw = psalm8 as RawPassage;

  it('is listed in index.json', () => {
    expect(index.passages.find((p) => p.id === 'psalm-8')?.file).toBe('psalm-8.json');
  });

  it('keeps the pasted lines, with 8:6-8 as one verse and the refrain as 8:9', () => {
    expect(raw.verses.map((v) => v.ref)).toEqual(['8:1', '8:2', '8:3', '8:4', '8:5', '8:6-8', '8:9']);
  });

  it('reproduces the original text exactly when blank markup is removed', () => {
    expect(raw.verses.map((v) => stripMarkup(v.text))).toEqual(PSALM_8_ORIGINAL);
    const p = parsePassage(raw);
    expect(p.verses.map((v) => v.plainText)).toEqual(PSALM_8_ORIGINAL);
    for (const c of p.challenges) {
      expect(c.distractors).toHaveLength(2);
      expect(new Set([c.answer, ...c.distractors]).size).toBe(3);
    }
  });
});

const PSALM_20_ORIGINAL = [
  '願耶和華在你遭難的日子應允你；願名為雅各神的高舉你。',
  '願他從聖所救助你，從錫安堅固你，',
  '記念你的一切供獻，悅納你的燔祭，（細拉）',
  '將你心所願的賜給你，成就你的一切籌算。',
  '我們要因你的救恩誇勝，要奉我們神的名豎立旌旗。願耶和華成就你一切所求的！',
  '現在我知道耶和華救護他的受膏者，必從他的聖天上應允他，用右手的能力救護他。',
  '有人靠車，有人靠馬，但我們要提到耶和華─我們神的名。',
  '他們都屈身仆倒，我們卻起來，立得正直。',
  '求耶和華施行拯救；我們呼求的時候，願王應允我們！',
];

describe('Psalm 20 passage file', () => {
  const raw = psalm20 as RawPassage;

  it('is listed in index.json', () => {
    expect(index.passages.find((p) => p.id === 'psalm-20')?.file).toBe('psalm-20.json');
  });

  it('has verses 20:1 to 20:9', () => {
    expect(raw.verses.map((v) => v.ref)).toEqual(Array.from({ length: 9 }, (_, i) => `20:${i + 1}`));
  });

  it('reproduces the original text exactly when blank markup is removed', () => {
    expect(raw.verses.map((v) => stripMarkup(v.text))).toEqual(PSALM_20_ORIGINAL);
    const p = parsePassage(raw);
    expect(p.verses.map((v) => v.plainText)).toEqual(PSALM_20_ORIGINAL);
    for (const c of p.challenges) {
      expect(c.distractors).toHaveLength(2);
      expect(new Set([c.answer, ...c.distractors]).size).toBe(3);
    }
  });
});

const PSALM_100_ORIGINAL = [
  '普天下當向耶和華歡呼！',
  '你們當樂意事奉耶和華，當來向他歌唱！',
  '你們當曉得耶和華是神！我們是他造的，也是屬他的；我們是他的民，也是他草場的羊。',
  '當稱謝進入他的門；當讚美進入他的院。當感謝他，稱頌他的名！',
  '因為耶和華本為善。他的慈愛存到永遠；他的信實直到萬代。',
];

describe('Psalm 100 passage file', () => {
  const raw = psalm100 as RawPassage;

  it('is listed in index.json', () => {
    expect(index.passages.find((p) => p.id === 'psalm-100')?.file).toBe('psalm-100.json');
  });

  it('has verses 100:1 to 100:5', () => {
    expect(raw.verses.map((v) => v.ref)).toEqual(Array.from({ length: 5 }, (_, i) => `100:${i + 1}`));
  });

  it('reproduces the original text exactly when blank markup is removed', () => {
    expect(raw.verses.map((v) => stripMarkup(v.text))).toEqual(PSALM_100_ORIGINAL);
    const p = parsePassage(raw);
    expect(p.verses.map((v) => v.plainText)).toEqual(PSALM_100_ORIGINAL);
    for (const c of p.challenges) {
      expect(c.distractors).toHaveLength(2);
      expect(new Set([c.answer, ...c.distractors]).size).toBe(3);
    }
  });
});

const PSALM_23_ORIGINAL = [
  '耶和華是我的牧者，我必不致缺乏。',
  '他使我躺臥在青草地上，領我在可安歇的水邊。',
  '他使我的靈魂甦醒，為自己的名引導我走義路。',
  '我雖然行過死蔭的幽谷，也不怕遭害，因為你與我同在；你的杖，你的竿，都安慰我。',
  '在我敵人面前，你為我擺設筵席；你用油膏了我的頭，使我的福杯滿溢。',
  '我一生一世必有恩惠慈愛隨著我；我且要住在耶和華的殿中，直到永遠。',
];

describe('Psalm 23 passage file', () => {
  const raw = psalm23 as RawPassage;

  it('is listed in index.json', () => {
    expect(index.passages.find((p) => p.id === 'psalm-23')?.file).toBe('psalm-23.json');
  });

  it('has verses 23:1 to 23:6', () => {
    expect(raw.verses.map((v) => v.ref)).toEqual(Array.from({ length: 6 }, (_, i) => `23:${i + 1}`));
  });

  it('reproduces the original text exactly when blank markup is removed', () => {
    expect(raw.verses.map((v) => stripMarkup(v.text))).toEqual(PSALM_23_ORIGINAL);
    const p = parsePassage(raw);
    expect(p.verses.map((v) => v.plainText)).toEqual(PSALM_23_ORIGINAL);
    for (const c of p.challenges) {
      expect(c.distractors).toHaveLength(2);
      expect(new Set([c.answer, ...c.distractors]).size).toBe(3);
    }
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

describe('zhuyin', () => {
  const text = '耶和華是我的[牧者|仇敵|審判]，我必不致[缺乏|富足|驕傲]。';
  const zhuyin = 'ㄧㄝˊ ㄏㄜˊ ㄏㄨㄚˊ ㄕˋ ㄨㄛˇ ㄉㄜ˙ ㄇㄨˋ ㄓㄜˇ ㄨㄛˇ ㄅㄧˋ ㄅㄨˋ ㄓˋ ㄑㄩㄝ ㄈㄚˊ';

  it('accepts one syllable per character, ignoring punctuation and blank markup', () => {
    expect(() => assertZhuyin(stripMarkup(text), zhuyin, 'verse 23:1')).not.toThrow();
  });

  it('rejects a syllable count that does not match the characters', () => {
    expect(() => assertZhuyin(stripMarkup(text), 'ㄧㄝˊ ㄏㄜˊ', 'verse 23:1')).toThrow(/2 syllables for 14 characters/);
  });

  it('rejects a token that is not 注音', () => {
    expect(() => assertZhuyin('主', 'zhu3', 'verse x')).toThrow(/not 注音/);
  });

  it('counts Chinese characters inside parenthetical notes', () => {
    const note = '比天使（或譯：神）微小';
    expect(() => assertZhuyin(note, 'ㄅㄧˇ ㄊㄧㄢ ㄕˇ ㄏㄨㄛˋ ㄧˋ ㄕㄣˊ ㄨㄟˊ ㄒㄧㄠˇ', 'verse 8:5')).not.toThrow();
    expect(() => assertZhuyin(note, 'ㄅㄧˇ ㄊㄧㄢ ㄕˇ', 'verse 8:5')).toThrow(/3 syllables for 8 characters/);
  });

  it('leaves verses without zhuyin unchecked', () => {
    for (const raw of [psalm1, psalm8, psalm16, psalm20, psalm23, psalm100] as RawPassage[]) {
      expect(() => parsePassage(raw)).not.toThrow();
    }
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
