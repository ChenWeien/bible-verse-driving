import type { Passage, Verse } from './passage';

export type TokenKind = 'text' | 'filled' | 'current' | 'future' | 'ellipsis';

export interface DisplayToken {
  text: string;
  kind: TokenKind;
}

export const BLANK_MARK = '＿＿';

/**
 * Turns a verse into display tokens for the given progress: blanks before `currentChallenge`
 * are filled, the current blank is `＿＿`, later blanks are dim `＿＿`.
 * Pass `currentChallenge = Infinity` to show the verse fully filled.
 */
export function verseTokens(verse: Verse, passage: Passage, currentChallenge: number): DisplayToken[] {
  return verse.parts.map((p): DisplayToken => {
    if (p.kind === 'text') return { text: p.text, kind: 'text' };
    const c = passage.challenges[p.challengeIndex];
    if (p.challengeIndex < currentChallenge) return { text: c.answer, kind: 'filled' };
    if (p.challengeIndex === currentChallenge) return { text: BLANK_MARK, kind: 'current' };
    return { text: BLANK_MARK, kind: 'future' };
  });
}

export function tokensLength(tokens: DisplayToken[]): number {
  return tokens.reduce((n, t) => n + [...t.text].length, 0);
}

const MAJOR_DELIMS = '。；！？';
const MINOR_DELIMS = '，：、';

/** Splits tokens into clauses; each clause ends right after a delimiter character. */
export function splitClauses(tokens: DisplayToken[], delims: string): DisplayToken[][] {
  const clauses: DisplayToken[][] = [];
  let cur: DisplayToken[] = [];
  for (const t of tokens) {
    if (t.kind !== 'text') {
      cur.push(t);
      continue;
    }
    let buf = '';
    for (const ch of t.text) {
      buf += ch;
      if (delims.includes(ch)) {
        cur.push({ text: buf, kind: 'text' });
        clauses.push(cur);
        cur = [];
        buf = '';
      }
    }
    if (buf) cur.push({ text: buf, kind: 'text' });
  }
  if (cur.length) clauses.push(cur);
  return clauses;
}

function windowAround(
  clauses: DisplayToken[][],
  focus: number,
  maxChars: number,
): { from: number; to: number } {
  let from = focus;
  let to = focus;
  let len = tokensLength(clauses[focus]);
  for (;;) {
    const nextLen = to + 1 < clauses.length ? tokensLength(clauses[to + 1]) : Infinity;
    const prevLen = from > 0 ? tokensLength(clauses[from - 1]) : Infinity;
    if (len + nextLen <= maxChars && nextLen <= prevLen) {
      to++;
      len += nextLen;
    } else if (len + prevLen <= maxChars) {
      from--;
      len += prevLen;
    } else if (len + nextLen <= maxChars) {
      to++;
      len += nextLen;
    } else {
      return { from, to };
    }
  }
}

const hasCurrent = (clause: DisplayToken[]) => clause.some((t) => t.kind === 'current');

/**
 * Shortens long verses for the overhead sign: keeps the sentence (or clauses) around the
 * current blank, up to about `maxChars`, adding `…` where text was cut.
 */
export function excerptAroundBlank(tokens: DisplayToken[], maxChars: number): DisplayToken[] {
  if (tokensLength(tokens) <= maxChars || !tokens.some((t) => t.kind === 'current')) return tokens;

  const sentences = splitClauses(tokens, MAJOR_DELIMS);
  const si = Math.max(0, sentences.findIndex(hasCurrent));
  let result: DisplayToken[];
  let cutStart: boolean;
  let cutEnd: boolean;
  if (tokensLength(sentences[si]) <= maxChars) {
    const { from, to } = windowAround(sentences, si, maxChars);
    result = sentences.slice(from, to + 1).flat();
    cutStart = from > 0;
    cutEnd = to < sentences.length - 1;
  } else {
    const clauses = splitClauses(sentences[si], MINOR_DELIMS);
    const ci = Math.max(0, clauses.findIndex(hasCurrent));
    const { from, to } = windowAround(clauses, ci, maxChars);
    result = clauses.slice(from, to + 1).flat();
    cutStart = si > 0 || from > 0;
    cutEnd = si < sentences.length - 1 || to < clauses.length - 1;
  }
  const out = [...result];
  if (cutStart) out.unshift({ text: '…', kind: 'ellipsis' });
  if (cutEnd) out.push({ text: '…', kind: 'ellipsis' });
  return out;
}
