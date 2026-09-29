import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Particles } from './Particles';

const burst = (p: Particles, count: number, life: [number, number] = [1, 1]) =>
  p.burst({ origin: new THREE.Vector3(0, 2, 0), count, colors: ['#ffffff'], life });

describe('Particles', () => {
  it('tracks live particles and expires them after their lifetime', () => {
    const p = new Particles(100);
    burst(p, 40);
    expect(p.alive).toBe(40);
    p.update(0.5);
    expect(p.alive).toBe(40);
    p.update(0.6);
    expect(p.alive).toBe(0);
  });

  it('recycles the oldest slots when the pool overflows', () => {
    const p = new Particles(50);
    burst(p, 30);
    burst(p, 30);
    expect(p.alive).toBe(50);
  });

  it('inherits velocity so bursts travel with the car', () => {
    const p = new Particles(10);
    p.burst({
      origin: new THREE.Vector3(),
      count: 10,
      colors: ['#ffffff'],
      inherit: new THREE.Vector3(0, 0, -20),
      spread: [0, 0],
      up: [0, 0],
      jitter: 0,
      gravity: 0,
      drag: 0,
      life: [5, 5],
    });
    p.update(0.5);
    const pos = p.points.geometry.attributes.position;
    expect(pos.getZ(0)).toBeCloseTo(-10, 5);
  });

  it('clear() removes all particles', () => {
    const p = new Particles(20);
    burst(p, 20);
    p.clear();
    expect(p.alive).toBe(0);
  });
});
