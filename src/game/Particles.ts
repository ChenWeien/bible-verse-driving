import * as THREE from 'three';

export interface BurstOptions {
  origin: THREE.Vector3;
  count: number;
  colors: THREE.ColorRepresentation[];
  /** Velocity added to every particle, e.g. the car's velocity so the burst travels with it. */
  inherit?: THREE.Vector3;
  /** Random horizontal speed range (m/s), in a random direction. */
  spread?: [number, number];
  /** Random upward speed range (m/s). */
  up?: [number, number];
  /** Random offset radius around `origin`. */
  jitter?: number;
  size?: [number, number];
  life?: [number, number];
  gravity?: number;
  /** Exponential velocity damping per second. */
  drag?: number;
}

const DEFAULT_MAX = 2000;

/**
 * Pooled additive point-sprite particles in world space. Dead particles stay in the buffer
 * with zero alpha, and new bursts overwrite the oldest slots once the pool is full.
 */
export class Particles {
  readonly points: THREE.Points;
  private readonly max: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly velocities: Float32Array;
  private readonly life: Float32Array;
  private readonly maxLife: Float32Array;
  private readonly baseSize: Float32Array;
  private readonly gravity: Float32Array;
  private readonly drag: Float32Array;
  private readonly material: THREE.ShaderMaterial;
  private next = 0;
  private live = 0;
  private color = new THREE.Color();

  constructor(max = DEFAULT_MAX) {
    this.max = max;
    this.positions = new Float32Array(max * 3);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.velocities = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.maxLife = new Float32Array(max);
    this.baseSize = new Float32Array(max);
    this.gravity = new Float32Array(max);
    this.drag = new Float32Array(max);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(this.colors, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1).setUsage(THREE.DynamicDrawUsage));

    this.material = new THREE.ShaderMaterial({
      uniforms: { uScale: { value: 400 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
      vertexShader: `attribute vec3 aColor; attribute float aSize; attribute float aAlpha;
        uniform float uScale; varying vec3 vColor; varying float vAlpha;
        void main() {
          vColor = aColor; vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aAlpha > 0.0 ? aSize * uScale / max(-mv.z, 0.1) : 0.0;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `varying vec3 vColor; varying float vAlpha;
        void main() {
          vec2 p = gl_PointCoord - 0.5;
          float d = length(p) * 2.0;
          if (d > 1.0) discard;
          float core = smoothstep(1.0, 0.0, d);
          gl_FragColor = vec4(vColor * (0.6 + 0.8 * core * core), vAlpha * core);
          #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 10;
  }

  /** Number of live particles. */
  get alive(): number {
    return this.live;
  }

  /** Call on resize: converts world-space size to pixels for the current viewport. */
  setViewport(heightPx: number, fovDeg: number) {
    this.material.uniforms.uScale.value = heightPx / (2 * Math.tan(THREE.MathUtils.degToRad(fovDeg) / 2));
  }

  burst(o: BurstOptions) {
    const [s0, s1] = o.spread ?? [2, 6];
    const [u0, u1] = o.up ?? [1, 4];
    const [z0, z1] = o.size ?? [0.2, 0.4];
    const [l0, l1] = o.life ?? [0.8, 1.4];
    const jitter = o.jitter ?? 0.3;
    for (let n = 0; n < o.count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      if (this.life[i] <= 0) this.live++;
      const i3 = i * 3;
      const a = Math.random() * Math.PI * 2;
      const sp = rand(s0, s1);
      this.positions[i3] = o.origin.x + (Math.random() - 0.5) * 2 * jitter;
      this.positions[i3 + 1] = o.origin.y + (Math.random() - 0.5) * 2 * jitter;
      this.positions[i3 + 2] = o.origin.z + (Math.random() - 0.5) * 2 * jitter;
      this.velocities[i3] = Math.cos(a) * sp + (o.inherit?.x ?? 0);
      this.velocities[i3 + 1] = rand(u0, u1) + (o.inherit?.y ?? 0);
      this.velocities[i3 + 2] = Math.sin(a) * sp + (o.inherit?.z ?? 0);
      this.color.set(o.colors[Math.floor(Math.random() * o.colors.length)]);
      this.colors[i3] = this.color.r;
      this.colors[i3 + 1] = this.color.g;
      this.colors[i3 + 2] = this.color.b;
      this.maxLife[i] = this.life[i] = rand(l0, l1);
      this.baseSize[i] = this.sizes[i] = rand(z0, z1);
      this.alphas[i] = 1;
      this.gravity[i] = o.gravity ?? 9;
      this.drag[i] = o.drag ?? 1;
    }
    this.markDirty(true);
  }

  update(dt: number) {
    if (this.live === 0 || dt <= 0) return;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.life[i] = 0;
        this.alphas[i] = 0;
        this.live--;
        continue;
      }
      const i3 = i * 3;
      const damp = Math.exp(-this.drag[i] * dt);
      this.velocities[i3] *= damp;
      this.velocities[i3 + 1] = this.velocities[i3 + 1] * damp - this.gravity[i] * dt;
      this.velocities[i3 + 2] *= damp;
      this.positions[i3] += this.velocities[i3] * dt;
      this.positions[i3 + 1] = Math.max(0.05, this.positions[i3 + 1] + this.velocities[i3 + 1] * dt);
      this.positions[i3 + 2] += this.velocities[i3 + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      // Quick fade-in, slow fade-out, plus a sparkle flicker.
      const flicker = 0.75 + 0.25 * Math.sin((this.maxLife[i] - this.life[i]) * 40 + i);
      this.alphas[i] = Math.min(1, (1 - t) * 12) * Math.min(1, t * 2.5) * flicker;
      this.sizes[i] = this.baseSize[i] * (0.5 + 0.5 * t);
    }
    this.markDirty(false);
  }

  clear() {
    this.life.fill(0);
    this.alphas.fill(0);
    this.live = 0;
    this.markDirty(true);
  }

  dispose() {
    this.points.geometry.dispose();
    this.material.dispose();
  }

  private markDirty(colors: boolean) {
    const attrs = this.points.geometry.attributes;
    attrs.position.needsUpdate = true;
    attrs.aSize.needsUpdate = true;
    attrs.aAlpha.needsUpdate = true;
    if (colors) attrs.aColor.needsUpdate = true;
  }
}

function rand(a: number, b: number): number {
  return a + Math.random() * (b - a);
}
