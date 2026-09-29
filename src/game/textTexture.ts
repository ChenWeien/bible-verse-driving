import * as THREE from 'three';

export const CJK_FONT =
  '"Microsoft JhengHei", "PingFang TC", "Noto Sans TC", "Noto Sans CJK TC", "Heiti TC", "Microsoft YaHei", sans-serif';

export interface TextRun {
  text: string;
  color?: string;
  /** Background highlight behind the run. */
  background?: string;
  /** Keep the run on one line (e.g. a blank or a filled word). */
  atomic?: boolean;
}

/** Characters that should not start a line (kinsoku). */
const NO_LINE_START = '，。、；：？！）」』》〉…,.;:?!)';

type Measure = (text: string) => number;

/** Wraps rich text runs into lines no wider than `maxWidth`, breaking between CJK characters. */
export function layoutRuns(runs: TextRun[], measure: Measure, maxWidth: number): TextRun[][] {
  type Piece = { text: string; run: TextRun };
  const pieces: Piece[] = [];
  for (const run of runs) {
    if (run.atomic) pieces.push({ text: run.text, run });
    else for (const ch of run.text) pieces.push({ text: ch, run });
  }

  const lines: Piece[][] = [];
  let line: Piece[] = [];
  let width = 0;
  for (const piece of pieces) {
    const w = measure(piece.text);
    if (line.length > 0 && width + w > maxWidth) {
      // Pull a trailing piece down with a punctuation mark that cannot start a line.
      if (NO_LINE_START.includes(piece.text) && line.length > 1) {
        const moved = line.pop()!;
        lines.push(line);
        line = [moved];
        width = measure(moved.text);
      } else {
        lines.push(line);
        line = [];
        width = 0;
      }
    }
    line.push(piece);
    width += w;
  }
  if (line.length) lines.push(line);

  // Merge consecutive pieces of the same run back together.
  return lines.map((ps) => {
    const out: TextRun[] = [];
    let prevSrc: TextRun | undefined;
    for (const p of ps) {
      if (p.run === prevSrc) out[out.length - 1].text += p.text;
      else out.push({ ...p.run, text: p.text });
      prevSrc = p.run;
    }
    return out;
  });
}

export interface TextTextureOptions {
  width: number;
  height: number;
  runs: TextRun[];
  /** Optional small header line (e.g. verse reference). */
  header?: TextRun;
  background?: string;
  border?: string;
  borderWidth?: number;
  color?: string;
  maxFontSize: number;
  minFontSize?: number;
  padding?: number;
  lineHeight?: number;
  align?: 'center' | 'left';
}

/**
 * Draws text onto a canvas, shrinking the font until the wrapped lines fit.
 * Returns a CanvasTexture ready for a MeshBasicMaterial.
 */
export function createTextTexture(opts: TextTextureOptions): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = opts.width;
  canvas.height = opts.height;
  drawText(canvas, opts);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

export function drawText(canvas: HTMLCanvasElement, opts: TextTextureOptions): void {
  const ctx = canvas.getContext('2d')!;
  const { width: W, height: H } = canvas;
  const pad = opts.padding ?? Math.round(H * 0.08);
  const lineHeight = opts.lineHeight ?? 1.25;
  const bw = opts.borderWidth ?? 0;

  ctx.clearRect(0, 0, W, H);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    roundRect(ctx, 0, 0, W, H, Math.min(W, H) * 0.08);
    ctx.fill();
  }
  if (opts.border && bw > 0) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = bw;
    roundRect(ctx, bw / 2, bw / 2, W - bw, H - bw, Math.min(W, H) * 0.07);
    ctx.stroke();
  }

  let top = pad + bw;
  if (opts.header) {
    const hs = Math.round(opts.maxFontSize * 0.5);
    ctx.font = `600 ${hs}px ${CJK_FONT}`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillStyle = opts.header.color ?? '#9fb3c8';
    ctx.fillText(opts.header.text, pad + bw, top);
    top += hs * 1.3;
  }

  const availW = W - 2 * (pad + bw);
  const availH = H - top - pad - bw;
  const minSize = opts.minFontSize ?? 12;
  let size = opts.maxFontSize;
  let lines: TextRun[][] = [];
  for (; size >= minSize; size = Math.floor(size * 0.92)) {
    ctx.font = `700 ${size}px ${CJK_FONT}`;
    lines = layoutRuns(opts.runs, (t) => ctx.measureText(t).width, availW);
    if (lines.length * size * lineHeight <= availH) break;
  }
  size = Math.max(size, minSize);
  ctx.font = `700 ${size}px ${CJK_FONT}`;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';

  const blockH = lines.length * size * lineHeight;
  let y = top + (availH - blockH) / 2 + (size * lineHeight) / 2;
  for (const line of lines) {
    const lineW = line.reduce((w, r) => w + ctx.measureText(r.text).width, 0);
    let x = opts.align === 'left' ? pad + bw : (W - lineW) / 2;
    for (const run of line) {
      const w = ctx.measureText(run.text).width;
      if (run.background) {
        ctx.fillStyle = run.background;
        roundRect(ctx, x - size * 0.08, y - size * 0.62, w + size * 0.16, size * 1.24, size * 0.18);
        ctx.fill();
      }
      ctx.fillStyle = run.color ?? opts.color ?? '#ffffff';
      ctx.fillText(run.text, x, y);
      x += w;
    }
    y += size * lineHeight;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
