import { describe, expect, it } from 'vitest';
import { laneAt, laneCenter, pointOnSegment, ROAD, segmentEnd, Track } from './Track';

describe('Track', () => {
  it('generates continuous segments that alternate straight and arc', () => {
    const track = new Track(42);
    track.ensureAhead(5000);
    const segs = track.segments;
    for (let i = 1; i < segs.length; i++) {
      const prev = segs[i - 1];
      const end = segmentEnd(prev);
      const cur = segs[i];
      expect(cur.startX).toBeCloseTo(end.x, 6);
      expect(cur.startZ).toBeCloseTo(end.z, 6);
      expect(cur.heading0).toBeCloseTo(end.heading, 6);
      expect(cur.s0).toBeCloseTo(prev.s0 + prev.length, 6);
      expect(cur.kind).not.toBe(prev.kind);
    }
  });

  it('never heads south, so the road never crosses itself', () => {
    const track = new Track(7);
    track.ensureAhead(20000);
    for (const seg of track.segments) {
      for (let t = 0; t <= seg.length; t += 5) {
        const p = pointOnSegment(seg, Math.min(t, seg.length));
        // South is +Z; the heading's Z component must never be clearly positive.
        expect(Math.sin(p.heading)).toBeLessThan(1e-6);
      }
    }
  });

  it('samples positions and a unit right vector', () => {
    const track = new Track(1);
    const s = track.sampleAt(10);
    expect(s.position.x).toBeCloseTo(0);
    expect(s.position.z).toBeCloseTo(-10);
    expect(s.right.x).toBeCloseTo(1);
    expect(s.tangent.z).toBeCloseTo(-1);
  });

  it('finds checkpoint slots only on straight segments', () => {
    const track = new Track(3);
    let minS = 100;
    for (let i = 0; i < 30; i++) {
      const gate = track.findStraightSlot(minS, 85, 25);
      const seg = track.segmentAt(gate);
      expect(seg.kind).toBe('straight');
      expect(gate - 85).toBeGreaterThanOrEqual(seg.s0 - 1e-6);
      expect(gate + 25).toBeLessThanOrEqual(seg.s0 + seg.length + 1e-6);
      minS = gate + 150;
    }
  });

  it('trims segments behind and keeps sampling valid', () => {
    const track = new Track(5);
    track.ensureAhead(3000);
    const removed = track.trimBefore(1500);
    expect(removed.length).toBeGreaterThan(0);
    expect(track.startS).toBeLessThanOrEqual(1500);
    expect(() => track.sampleAt(2000)).not.toThrow();
  });

  it('measures distance to the road', () => {
    const track = new Track(1);
    expect(track.distanceToCenterline(5, -50)).toBeCloseTo(5);
  });
});

describe('lanes', () => {
  it('maps lateral offsets to 3 lanes', () => {
    expect(laneAt(-ROAD.halfWidth + 0.1)).toBe(0);
    expect(laneAt(0)).toBe(1);
    expect(laneAt(ROAD.halfWidth - 0.1)).toBe(2);
    expect(laneAt(laneCenter(2))).toBe(2);
    expect(laneAt(100)).toBe(2);
  });
});
