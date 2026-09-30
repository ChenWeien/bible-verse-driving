/**
 * Passage data: JSON loading and the `[correct|distractor1|distractor2]` blank syntax.
 */

export interface PassageIndexEntry {
  id: string;
  file: string;
  title?: string;
}

export interface PassageIndex {
  default: string;
  passages: PassageIndexEntry[];
}

export interface RawVerse {
  ref: string;
  text: string;
  /**
   * Optional 注音, one syllable per Chinese character in the filled verse (`text` with the
   * correct word of each blank). Spaces separate syllables. Punctuation is not annotated.
   */
  zhuyin?: string;
}

export interface RawPassage {
  id: string;
  title: string;
  reference?: string;
  verses: RawVerse[];
}

export type VersePart =
  | { kind: 'text'; text: string }
  | { kind: 'blank'; challengeIndex: number };

export interface Verse {
  ref: string;
  /** The verse text with every blank replaced by its correct word. */
  plainText: string;
  parts: VersePart[];
}

export interface Challenge {
  index: number;
  verseIndex: number;
  answer: string;
  /** Wrong words; always at least 2 when the passage has enough other words to borrow from. */
  distractors: string[];
}

export interface Passage {
  id: string;
  title: string;
  reference: string;
  verses: Verse[];
  challenges: Challenge[];
}

export class PassageError extends Error {}

const BLANK_RE = /\[([^\[\]]*)\]/g;
const HAN_RE = /\p{Script=Han}/gu;
const ZHUYIN_SYLLABLE_RE = /^[˙ˊˇˋ]?[\u3105-\u3129]+[˙ˊˇˋ]?$/u;

/** Chinese characters in order, skipping punctuation and other marks. */
export function hanCharacters(text: string): string[] {
  return text.match(HAN_RE) ?? [];
}

/** Splits a `zhuyin` string into syllables. */
export function zhuyinSyllables(zhuyin: string): string[] {
  return zhuyin.trim().split(/\s+/).filter(Boolean);
}

/**
 * Checks that `zhuyin` lines up with the Chinese characters of the filled verse.
 * Returns nothing when `zhuyin` is missing or blank.
 */
export function assertZhuyin(plainText: string, zhuyin: string | undefined, where: string): void {
  if (zhuyin === undefined || zhuyin.trim() === '') return;
  const chars = hanCharacters(plainText);
  const syllables = zhuyinSyllables(zhuyin);
  const bad = syllables.filter((s) => !ZHUYIN_SYLLABLE_RE.test(s));
  if (bad.length > 0) {
    throw new PassageError(`${where}: zhuyin has a syllable that is not 注音: ${bad.join(' ')}`);
  }
  if (syllables.length !== chars.length) {
    throw new PassageError(
      `${where}: zhuyin has ${syllables.length} syllables for ${chars.length} characters (${chars.join('')})`,
    );
  }
}

/** Removes blank markup, keeping the correct word: `求你[保佑|離棄]我` -> `求你保佑我`. */
export function stripMarkup(text: string): string {
  return text.replace(BLANK_RE, (_m, inner: string) => inner.split('|')[0].trim());
}

interface ParsedBlank {
  answer: string;
  distractors: string[];
}

export function parseVerseText(
  text: string,
  where = 'verse',
): Array<{ kind: 'text'; text: string } | ({ kind: 'blank' } & ParsedBlank)> {
  const parts: Array<{ kind: 'text'; text: string } | ({ kind: 'blank' } & ParsedBlank)> = [];
  let last = 0;
  for (const m of text.matchAll(BLANK_RE)) {
    const start = m.index ?? 0;
    if (start > last) parts.push({ kind: 'text', text: text.slice(last, start) });
    const words = m[1].split('|').map((w) => w.trim());
    const answer = words[0];
    if (!answer) throw new PassageError(`${where}: blank "${m[0]}" has no correct word`);
    const distractors = unique(words.slice(1).filter((w) => w && w !== answer));
    parts.push({ kind: 'blank', answer, distractors });
    last = start + m[0].length;
  }
  if (last < text.length) parts.push({ kind: 'text', text: text.slice(last) });
  const leftover = parts.some((p) => p.kind === 'text' && /[\[\]]/.test(p.text));
  if (leftover) throw new PassageError(`${where}: unbalanced "[" or "]" in "${text}"`);
  return parts;
}

function unique(words: string[]): string[] {
  return [...new Set(words)];
}

/**
 * Parses a raw passage. Blanks with fewer than 2 distractors borrow words from the other
 * blanks in the passage (preferring words of the same length).
 */
export function parsePassage(raw: RawPassage, rng: () => number = Math.random): Passage {
  if (!raw || typeof raw !== 'object') throw new PassageError('passage JSON must be an object');
  if (!Array.isArray(raw.verses) || raw.verses.length === 0) {
    throw new PassageError(`passage "${raw.id ?? '?'}" has no verses`);
  }
  const verses: Verse[] = [];
  const challenges: Challenge[] = [];
  raw.verses.forEach((rv, verseIndex) => {
    if (typeof rv?.text !== 'string') throw new PassageError(`verse #${verseIndex + 1} has no "text"`);
    const ref = String(rv.ref ?? verseIndex + 1);
    const parsed = parseVerseText(rv.text, `verse ${ref}`);
    const parts: VersePart[] = parsed.map((p) => {
      if (p.kind === 'text') return p;
      const challenge: Challenge = {
        index: challenges.length,
        verseIndex,
        answer: p.answer,
        distractors: p.distractors,
      };
      challenges.push(challenge);
      return { kind: 'blank', challengeIndex: challenge.index };
    });
    const plainText = stripMarkup(rv.text);
    if (rv.zhuyin !== undefined && typeof rv.zhuyin !== 'string') {
      throw new PassageError(`verse ${ref}: "zhuyin" must be a string`);
    }
    assertZhuyin(plainText, rv.zhuyin, `verse ${ref}`);
    verses.push({ ref, plainText, parts });
  });
  if (challenges.length === 0) {
    throw new PassageError(`passage "${raw.id}" has no blanks; mark words like [correct|wrong1|wrong2]`);
  }

  const pool = unique(challenges.flatMap((c) => [c.answer, ...c.distractors]));
  for (const c of challenges) {
    if (c.distractors.length >= 2) continue;
    const candidates = pool.filter((w) => w !== c.answer && !c.distractors.includes(w));
    shuffle(candidates, rng);
    candidates.sort((a, b) => Math.abs(a.length - c.answer.length) - Math.abs(b.length - c.answer.length));
    c.distractors = [...c.distractors, ...candidates.slice(0, 2 - c.distractors.length)];
  }

  return {
    id: String(raw.id ?? 'passage'),
    title: String(raw.title ?? raw.id ?? ''),
    reference: String(raw.reference ?? ''),
    verses,
    challenges,
  };
}

export function shuffle<T>(arr: T[], rng: () => number = Math.random): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** The 3 gate words for a challenge: the answer plus 2 distractors, shuffled. */
export function challengeOptions(c: Challenge, rng: () => number = Math.random): string[] {
  return shuffle([c.answer, ...c.distractors.slice(0, 2)], rng);
}

function passageUrl(file: string): string {
  return `${import.meta.env.BASE_URL}passages/${file}`;
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new PassageError(`cannot load ${url} (HTTP ${res.status})`);
  try {
    return (await res.json()) as T;
  } catch (err) {
    throw new PassageError(`${url} is not valid JSON: ${(err as Error).message}`);
  }
}

export async function loadPassageIndex(): Promise<PassageIndex> {
  const index = await fetchJson<PassageIndex>(passageUrl('index.json'));
  if (!Array.isArray(index.passages) || index.passages.length === 0) {
    throw new PassageError('passages/index.json lists no passages');
  }
  return index;
}

export async function loadPassage(entry: PassageIndexEntry): Promise<Passage> {
  const raw = await fetchJson<RawPassage>(passageUrl(entry.file));
  return parsePassage(raw);
}
