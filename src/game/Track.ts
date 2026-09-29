import * as THREE from 'three';
import { mulberry32, randRange } from './rng';

/**
 * Procedural city road: straight segments joined by 90-degree corner arcs.
 *
 * Coordinates are on the XZ plane (Y up). A heading angle `a` means direction
 * (cos a, 0, sin a); the start heading is "north" (-Z). The right-hand vector is
 * (-sin a, 0, cos a), so turning right increases `a`.
 *
 * The world heading is limited to north, west or east (never south), so the road
 * climbs like a staircase and can never cross itself.
 */

export type SegmentKind = 'straight' | 'arc';

export interface Segment {
  id: number;
  kind: SegmentKind;
  /** Distance along the track where this segment starts. */
  s0: number;
  length: number;
  startX: number;
  startZ: number;
  heading0: number;
  /** +1 = right turn, -1 = left turn, 0 = straight. */
  turn: -1 | 0 | 1;
  radius: number;
}

export interface TrackSample {
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3;
  heading: number;
}

export const ROAD = {
  laneCount: 3,
  laneWidth: 4.5,
  get halfWidth() {
    return (this.laneCount * this.laneWidth) / 2;
  },
  sidewalkWidth: 3.2,
  arcRadius: 34,
  straightMin: 170,
  straightMax: 260,
  firstStraight: 320,
} as const;

/** 0 = north, -1 = west, +1 = east (index into the allowed world directions). */
type Dir = -1 | 0 | 1;
const NORTH = -Math.PI / 2;

export function segmentEnd(seg: Segment): { x: number; z: number; heading: number } {
  const p = pointOnSegment(seg, seg.length);
  return { x: p.x, z: p.z, heading: p.heading };
}

export function pointOnSegment(seg: Segment, t: number): { x: number; z: number; heading: number } {
  const a0 = seg.heading0;
  if (seg.kind === 'straight') {
    return { x: seg.startX + Math.cos(a0) * t, z: seg.startZ + Math.sin(a0) * t, heading: a0 };
  }
  const R = seg.radius;
  const sg = seg.turn;
  // Arc center is R to the turning side of the start point.
  const cx = seg.startX - Math.sin(a0) * R * sg;
  const cz = seg.startZ + Math.cos(a0) * R * sg;
  const a = a0 + (sg * t) / R;
  return { x: cx + Math.sin(a) * R * sg, z: cz - Math.cos(a) * R * sg, heading: a };
}

export class Track {
  readonly segments: Segment[] = [];
  private rng: () => number;
  private nextId = 0;
  private dir: Dir = 0;
  /** Cached centerline sample points per segment (for distance queries). */
  private polyCache = new Map<number, Float32Array>();

  constructor(seed = 1) {
    this.rng = mulberry32(seed);
    this.push({ kind: 'straight', length: ROAD.firstStraight, turn: 0, radius: 0 }, 0, 0, NORTH, 0);
  }

  get startS(): number {
    return this.segments[0].s0;
  }

  get endS(): number {
    const last = this.segments[this.segments.length - 1];
    return last.s0 + last.length;
  }

  private push(
    def: { kind: SegmentKind; length: number; turn: -1 | 0 | 1; radius: number },
    x: number,
    z: number,
    heading: number,
    s0: number,
  ): Segment {
    const seg: Segment = { id: this.nextId++, s0, startX: x, startZ: z, heading0: heading, ...def };
    this.segments.push(seg);
    return seg;
  }

  private generateNext(): Segment {
    const last = this.segments[this.segments.length - 1];
    const end = segmentEnd(last);
    const s0 = last.s0 + last.length;
    if (last.kind === 'arc') {
      const length = Math.round(randRange(this.rng, ROAD.straightMin, ROAD.straightMax));
      return this.push({ kind: 'straight', length, turn: 0, radius: 0 }, end.x, end.z, end.heading, s0);
    }
    let turn: -1 | 1;
    if (this.dir === 0) turn = this.rng() < 0.5 ? -1 : 1;
    else turn = this.dir === -1 ? 1 : -1;
    this.dir = (this.dir + turn) as Dir;
    const R = ROAD.arcRadius;
    return this.push(
      { kind: 'arc', length: (R * Math.PI) / 2, turn, radius: R },
      end.x,
      end.z,
      end.heading,
      s0,
    );
  }

  /** Generates segments until the track reaches at least distance `s`. */
  ensureAhead(s: number): Segment[] {
    const added: Segment[] = [];
    while (this.endS < s) added.push(this.generateNext());
    return added;
  }

  /** Removes whole segments that end before `s` (always keeps at least one). */
  trimBefore(s: number): Segment[] {
    const removed: Segment[] = [];
    while (this.segments.length > 1 && this.segments[0].s0 + this.segments[0].length < s) {
      const seg = this.segments.shift()!;
      this.polyCache.delete(seg.id);
      removed.push(seg);
    }
    return removed;
  }

  segmentAt(s: number): Segment {
    const segs = this.segments;
    if (s <= segs[0].s0) return segs[0];
    for (let i = 0; i < segs.length; i++) {
      if (s < segs[i].s0 + segs[i].length) return segs[i];
    }
    return segs[segs.length - 1];
  }

  sampleAt(s: number, out?: TrackSample): TrackSample {
    const seg = this.segmentAt(s);
    const t = THREE.MathUtils.clamp(s - seg.s0, 0, seg.length);
    const p = pointOnSegment(seg, t);
    const o = out ?? {
      position: new THREE.Vector3(),
      tangent: new THREE.Vector3(),
      right: new THREE.Vector3(),
      heading: 0,
    };
    o.position.set(p.x, 0, p.z);
    o.tangent.set(Math.cos(p.heading), 0, Math.sin(p.heading));
    o.right.set(-Math.sin(p.heading), 0, Math.cos(p.heading));
    o.heading = p.heading;
    return o;
  }

  /**
   * Finds a distance `gateS` for a checkpoint on a straight segment so that
   * [gateS - before, gateS + after] fits in the straight and gateS >= minS.
   * Generates more track if needed.
   */
  findStraightSlot(minS: number, before: number, after: number): number {
    for (let guard = 0; guard < 200; guard++) {
      for (const seg of this.segments) {
        if (seg.kind !== 'straight') continue;
        const lo = Math.max(seg.s0 + before, minS);
        const hi = seg.s0 + seg.length - after;
        if (lo <= hi) return lo;
      }
      this.generateNext();
    }
    throw new Error('findStraightSlot: no straight segment found');
  }

  private polyline(seg: Segment): Float32Array {
    let pts = this.polyCache.get(seg.id);
    if (!pts) {
      const n = seg.kind === 'straight' ? 1 : Math.ceil(seg.length / 2);
      pts = new Float32Array((n + 1) * 2);
      for (let i = 0; i <= n; i++) {
        const p = pointOnSegment(seg, (seg.length * i) / n);
        pts[i * 2] = p.x;
        pts[i * 2 + 1] = p.z;
      }
      this.polyCache.set(seg.id, pts);
    }
    return pts;
  }

  /** Distance on the XZ plane from (x, z) to the nearest road centerline. */
  distanceToCenterline(x: number, z: number): number {
    let best = Infinity;
    for (const seg of this.segments) {
      const pts = this.polyline(seg);
      for (let i = 0; i + 3 < pts.length; i += 2) {
        best = Math.min(best, distToSegment(x, z, pts[i], pts[i + 1], pts[i + 2], pts[i + 3]));
      }
    }
    return best;
  }
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  let t = len2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const qx = ax + dx * t - px;
  const qz = az + dz * t - pz;
  return Math.sqrt(qx * qx + qz * qz);
}

/** Lane index (0..laneCount-1, left to right) for a lateral offset from the centerline. */
export function laneAt(offset: number): number {
  const i = Math.floor((offset + ROAD.halfWidth) / ROAD.laneWidth);
  return THREE.MathUtils.clamp(i, 0, ROAD.laneCount - 1);
}

export function laneCenter(lane: number): number {
  return -ROAD.halfWidth + ROAD.laneWidth * (lane + 0.5);
}
