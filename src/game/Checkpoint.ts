import * as THREE from 'three';
import type { Challenge, Passage } from '../data/passage';
import { excerptAroundBlank, verseTokens, type DisplayToken } from '../data/verseDisplay';
import { createTextTexture, drawText, type TextRun, type TextTextureOptions } from './textTexture';
import { laneAt, laneCenter, ROAD, type Track } from './Track';

/** Distance from the overhead verse sign to the gate line. */
export const SIGN_LEAD = 30;
/** Max characters of verse text on the sign before it is shortened to the clause around the blank. */
export const SIGN_MAX_CHARS = 40;

export interface CrossingResult {
  lane: number;
  correct: boolean;
  /** The lane already has a dropped barrier from an earlier wrong pick. */
  alreadyBarred: boolean;
}

const TOKEN_STYLE: Record<DisplayToken['kind'], Partial<TextRun>> = {
  text: { color: '#ffffff' },
  filled: { color: '#8dffb0', atomic: true },
  current: { color: '#1b1b1b', background: '#ffd84a', atomic: true },
  future: { color: '#9fb5ad', atomic: true },
  ellipsis: { color: '#b9cfc4' },
};

export function tokensToRuns(tokens: DisplayToken[]): TextRun[] {
  return tokens.map((t) => ({ text: t.text, ...TOKEN_STYLE[t.kind] }));
}

interface Lane {
  word: string;
  panelMat: THREE.MeshBasicMaterial;
  panelTex: THREE.CanvasTexture;
  frameMat: THREE.MeshBasicMaterial;
  curtainMat: THREE.MeshBasicMaterial;
  stripMat: THREE.MeshBasicMaterial;
  barrier: THREE.Mesh;
  barrierT: number;
  barred: boolean;
}

/**
 * One fill-in-the-blank checkpoint on a straight road segment: an overhead sign with the
 * verse and 3 word gates across the lanes at `gateS`.
 */
export class Checkpoint {
  readonly group = new THREE.Group();
  readonly gateS: number;
  readonly challenge: Challenge;
  readonly options: string[];
  readonly correctLane: number;
  solved = false;
  hinting = false;

  private passage: Passage;
  private lanes: Lane[] = [];
  private signTex: THREE.CanvasTexture;
  private signOpts: TextTextureOptions;
  private disposables: Array<{ dispose(): void }> = [];
  private time = 0;
  private flash = 0;

  constructor(track: Track, gateS: number, passage: Passage, challenge: Challenge, options: string[]) {
    this.gateS = gateS;
    this.passage = passage;
    this.challenge = challenge;
    this.options = options;
    this.correctLane = options.indexOf(challenge.answer);

    // Local frame: +X = road right, -Z = driving direction, origin = gate line center.
    const smp = track.sampleAt(gateS);
    this.group.position.copy(smp.position);
    this.group.rotation.y = -smp.heading - Math.PI / 2;

    this.signOpts = this.makeSignOptions(challenge.index);
    this.signTex = createTextTexture(this.signOpts);
    this.buildSign();
    this.buildGates();
  }

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  private makeSignOptions(progress: number): TextTextureOptions {
    const verse = this.passage.verses[this.challenge.verseIndex];
    const tokens = excerptAroundBlank(verseTokens(verse, this.passage, progress), SIGN_MAX_CHARS);
    const total = this.passage.challenges.length;
    return {
      width: 2048,
      height: 800,
      runs: tokensToRuns(tokens),
      header: { text: `${verse.ref}　　第 ${this.challenge.index + 1} / ${total} 空格`, color: '#cfe8da' },
      background: '#0e5a36',
      border: '#f4f4f4',
      borderWidth: 18,
      maxFontSize: 150,
      minFontSize: 60,
      padding: 56,
      lineHeight: 1.28,
    };
  }

  private buildSign() {
    const hw = ROAD.halfWidth;
    const w = hw * 2 + 4;
    const h = (w * this.signOpts.height) / this.signOpts.width;
    const bottom = 5.6;
    const sign = new THREE.Group();
    sign.position.z = SIGN_LEAD;

    const postMat = this.track(new THREE.MeshStandardMaterial({ color: '#6f7680', metalness: 0.6, roughness: 0.4 }));
    const postGeo = this.track(new THREE.BoxGeometry(0.45, bottom + h + 0.4, 0.45));
    for (const x of [-(w / 2 + 0.3), w / 2 + 0.3]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x, (bottom + h + 0.4) / 2, -0.4);
      sign.add(post);
    }
    const beamGeo = this.track(new THREE.BoxGeometry(w + 1, 0.35, 0.35));
    for (const y of [bottom + h * 0.25, bottom + h * 0.75]) {
      const beam = new THREE.Mesh(beamGeo, postMat);
      beam.position.set(0, y, -0.4);
      sign.add(beam);
    }
    const back = new THREE.Mesh(this.track(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.15)), this.track(new THREE.MeshStandardMaterial({ color: '#2a2f36' })));
    back.position.set(0, bottom + h / 2, -0.12);
    const panel = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(w, h)),
      this.track(new THREE.MeshBasicMaterial({ map: this.track(this.signTex), toneMapped: false })),
    );
    panel.position.set(0, bottom + h / 2, 0);
    sign.add(back, panel);
    this.group.add(sign);
  }

  private wordOptions(word: string, bg: string, border: string): TextTextureOptions {
    return {
      width: 512,
      height: 224,
      runs: [{ text: word }],
      background: bg,
      border,
      borderWidth: 12,
      maxFontSize: 140,
      minFontSize: 40,
      padding: 20,
      color: '#ffffff',
    };
  }

  private buildGates() {
    const hw = ROAD.halfWidth;
    const lw = ROAD.laneWidth;
    const top = 5.8;
    const postMat = this.track(new THREE.MeshStandardMaterial({ color: '#dfe3ea', metalness: 0.3, roughness: 0.5 }));
    const postGeo = this.track(new THREE.BoxGeometry(0.35, top, 0.35));
    for (let i = 0; i <= ROAD.laneCount; i++) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(-hw + i * lw, top / 2, 0);
      this.group.add(post);
    }
    const beam = new THREE.Mesh(this.track(new THREE.BoxGeometry(hw * 2 + 0.35, 0.4, 0.4)), postMat);
    beam.position.set(0, top, 0);
    this.group.add(beam);

    const panelW = lw - 0.5;
    const panelH = (panelW * 224) / 512;
    const panelGeo = this.track(new THREE.PlaneGeometry(panelW, panelH));
    const frameGeo = this.track(new THREE.PlaneGeometry(panelW + 0.5, panelH + 0.5));
    const curtainGeo = this.track(new THREE.PlaneGeometry(lw - 0.45, 3.4));
    const stripGeo = this.track(new THREE.PlaneGeometry(lw - 0.4, 1.4).rotateX(-Math.PI / 2));
    const barrierGeo = this.track(new THREE.BoxGeometry(lw - 0.4, 0.55, 0.3));
    const barrierTex = this.track(stripeTexture());
    const barrierMat = this.track(new THREE.MeshStandardMaterial({ map: barrierTex, emissive: '#550000', roughness: 0.6 }));

    this.options.forEach((word, i) => {
      const x = laneCenter(i);
      const panelTex = this.track(createTextTexture(this.wordOptions(word, '#123e73', '#ffffff')));
      const panelMat = this.track(new THREE.MeshBasicMaterial({ map: panelTex, toneMapped: false }));
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(x, top - 0.35 - panelH / 2, 0.25);
      const frameMat = this.track(
        new THREE.MeshBasicMaterial({ color: '#ffe14d', transparent: true, opacity: 0, toneMapped: false, depthWrite: false }),
      );
      const frame = new THREE.Mesh(frameGeo, frameMat);
      frame.position.set(x, panel.position.y, 0.2);
      const curtainMat = this.track(
        new THREE.MeshBasicMaterial({
          color: '#66ffa0',
          transparent: true,
          opacity: 0,
          side: THREE.DoubleSide,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        }),
      );
      const curtain = new THREE.Mesh(curtainGeo, curtainMat);
      curtain.position.set(x, 1.75, 0);
      const stripMat = this.track(
        new THREE.MeshBasicMaterial({ color: '#4aa8ff', transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }),
      );
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(x, 0.05, 0);
      const barrier = new THREE.Mesh(barrierGeo, barrierMat);
      barrier.position.set(x, top - 0.6, 0);
      barrier.visible = false;
      this.group.add(panel, frame, curtain, strip, barrier);
      this.lanes.push({ word, panelMat, panelTex, frameMat, curtainMat, stripMat, barrier, barrierT: 0, barred: false });
    });
  }

  get signS(): number {
    return this.gateS - SIGN_LEAD;
  }

  laneAt(offset: number): number {
    return laneAt(offset);
  }

  /** Converts a point in the gate frame (+X = road right, +Y = up, origin = gate line center) to world space. */
  worldPoint(x: number, y: number, z = 0, target = new THREE.Vector3()): THREE.Vector3 {
    this.group.updateMatrixWorld();
    return this.group.localToWorld(target.set(x, y, z));
  }

  isBarred(lane: number): boolean {
    return this.lanes[lane]?.barred ?? false;
  }

  /** Detects the car crossing the gate line between two frames. */
  checkCrossing(prevS: number, s: number, offset: number): CrossingResult | null {
    if (this.solved || !(prevS < this.gateS && s >= this.gateS)) return null;
    const lane = laneAt(offset);
    return { lane, correct: lane === this.correctLane, alreadyBarred: this.lanes[lane].barred };
  }

  /** Drops the barrier in a wrong lane and makes the correct gate glow. */
  markWrong(lane: number) {
    const l = this.lanes[lane];
    if (!l.barred) {
      l.barred = true;
      l.barrier.visible = true;
      l.barrierT = 0;
      l.panelMat.color.set('#777777');
    }
    l.stripMat.color.set('#ff3b3b');
    l.stripMat.opacity = 0.8;
    this.hinting = true;
  }

  markSolved() {
    this.solved = true;
    this.hinting = false;
    this.flash = 1;
    const correct = this.lanes[this.correctLane];
    drawText(correct.panelTex.image as HTMLCanvasElement, this.wordOptions(correct.word, '#1b8a45', '#ffffff'));
    correct.panelTex.needsUpdate = true;
    correct.stripMat.color.set('#45e07a');
    this.lanes.forEach((l, i) => {
      if (i !== this.correctLane) {
        l.panelMat.color.set('#555555');
        l.stripMat.opacity = 0.2;
      }
    });
    this.signOpts = this.makeSignOptions(this.challenge.index + 1);
    drawText(this.signTex.image as HTMLCanvasElement, this.signOpts);
    this.signTex.needsUpdate = true;
  }

  update(dt: number) {
    this.time += dt;
    this.flash = Math.max(0, this.flash - dt * 0.8);
    this.lanes.forEach((l, i) => {
      if (l.barrier.visible && l.barrierT < 1) {
        l.barrierT = Math.min(1, l.barrierT + dt * 4);
        const t = l.barrierT;
        // Drop with a small bounce at the end.
        const ease = t < 0.75 ? (t / 0.75) ** 2 : 1 - Math.sin(((t - 0.75) / 0.25) * Math.PI) * 0.08;
        l.barrier.position.y = THREE.MathUtils.lerp(5.2, 1.0, ease);
      }
      const isCorrect = i === this.correctLane;
      if (isCorrect && this.hinting) {
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 7);
        l.frameMat.opacity = 0.55 + 0.45 * pulse;
        l.curtainMat.opacity = 0.18 + 0.25 * pulse;
        l.stripMat.color.set('#ffe14d');
        l.stripMat.opacity = 0.6 + 0.3 * pulse;
      } else if (isCorrect && this.solved) {
        l.frameMat.color.set('#45e07a');
        l.frameMat.opacity = 0.9;
        l.curtainMat.opacity = 0.5 * this.flash;
      } else if (!l.barred) {
        l.frameMat.opacity = 0;
        l.curtainMat.opacity = 0;
      } else {
        l.frameMat.opacity = 0;
        l.curtainMat.color.set('#ff4040');
        l.curtainMat.opacity = Math.max(0, 0.35 - l.barrierT * 0.2);
      }
    });
  }

  dispose() {
    this.group.removeFromParent();
    this.disposables.forEach((d) => d.dispose());
    this.disposables = [];
  }
}

function stripeTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 32;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, 256, 32);
  ctx.fillStyle = '#e02020';
  for (let x = -32; x < 256; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 32);
    ctx.lineTo(x + 24, 32);
    ctx.lineTo(x + 48, 0);
    ctx.lineTo(x + 24, 0);
    ctx.closePath();
    ctx.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
