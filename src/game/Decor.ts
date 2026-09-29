import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { randRange } from './rng';
import { pointOnSegment, ROAD, type Segment } from './Track';

/** Width of the garden strip between the sidewalk and the buildings. */
export const VERGE_WIDTH = 2.8;

const FLOWER_COLORS = ['#ff4f6d', '#ffd23f', '#ff8fd0', '#b57bff', '#ffffff', '#ff7a3d', '#6fb7ff'];
const BUTTERFLY_COLORS = ['#ffd23f', '#ff8a3d', '#8fd3ff', '#ffffff', '#ff7ad9', '#b8ff6a'];
const BUSH_COLORS = ['#3f7a36', '#4d8a3a', '#2f6a3a', '#5a9444'];
const TRUNK = '#5a4030';
const UP = new THREE.Vector3(0, 1, 0);
const AXIS_X = new THREE.Vector3(1, 0, 0);
const AXIS_Z = new THREE.Vector3(0, 0, 1);

type Part = { geo: THREE.BufferGeometry; color: THREE.ColorRepresentation };

/** Merges geometries into one, baking each part's color into a vertex color attribute. */
function mergeColored(parts: Part[]): THREE.BufferGeometry {
  const c = new THREE.Color();
  const geos = parts.map(({ geo, color }) => {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (g !== geo) geo.dispose();
    g.deleteAttribute('uv');
    c.set(color);
    const n = g.attributes.position.count;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
    return g;
  });
  const merged = mergeGeometries(geos)!;
  geos.forEach((g) => g.dispose());
  return merged;
}

const trunk = (h: number, r = 0.18) => new THREE.CylinderGeometry(r * 0.7, r, h, 6).translate(0, h / 2, 0);
const ico = (r: number, x: number, y: number, z: number, detail = 0) => new THREE.IcosahedronGeometry(r, detail).translate(x, y, z);

function treeGeometries(): THREE.BufferGeometry[] {
  const fruitDirs = [
    [0.8, 0.3, 0.5],
    [-0.7, 0.1, 0.7],
    [0.1, -0.2, 1],
    [-0.9, 0.4, -0.2],
    [0.6, 0.0, -0.8],
    [-0.2, 0.6, -0.8],
    [0.95, -0.3, -0.1],
  ];
  return [
    // Round shade tree.
    mergeColored([
      { geo: trunk(2.2), color: TRUNK },
      { geo: ico(1.5, 0, 3.2, 0), color: '#3f7d3a' },
      { geo: ico(0.9, 0.9, 3.7, 0.3), color: '#4a8a40' },
    ]),
    // Pine.
    mergeColored([
      { geo: trunk(1.4, 0.16), color: '#4d3526' },
      { geo: new THREE.ConeGeometry(1.6, 2.2, 7).translate(0, 2.1, 0), color: '#2f5e3a' },
      { geo: new THREE.ConeGeometry(1.25, 1.9, 7).translate(0, 3.2, 0), color: '#346842' },
      { geo: new THREE.ConeGeometry(0.85, 1.6, 7).translate(0, 4.3, 0), color: '#3a7349' },
    ]),
    // Cherry blossom.
    mergeColored([
      { geo: trunk(2.0), color: '#4a3228' },
      { geo: ico(1.2, 0, 3.3, 0), color: '#f4a6c8' },
      { geo: ico(0.9, 0.9, 2.9, 0.3), color: '#ffc4dc' },
      { geo: ico(0.95, -0.8, 3.0, -0.4), color: '#f7b3d0' },
      { geo: ico(0.85, 0.1, 3.1, -0.9), color: '#ffd6e7' },
      { geo: ico(0.8, -0.2, 2.8, 0.9), color: '#f29bc1' },
    ]),
    // Autumn maple.
    mergeColored([
      { geo: trunk(2.0), color: TRUNK },
      { geo: new THREE.DodecahedronGeometry(1.6, 0).scale(1, 0.8, 1).translate(0, 3.2, 0), color: '#e07a2e' },
      { geo: new THREE.DodecahedronGeometry(0.9, 0).translate(0.8, 3.6, 0.4), color: '#c9412f' },
      { geo: new THREE.DodecahedronGeometry(0.8, 0).translate(-0.7, 3.7, -0.5), color: '#f0a233' },
    ]),
    // Cypress.
    mergeColored([
      { geo: trunk(0.9, 0.15), color: TRUNK },
      { geo: new THREE.IcosahedronGeometry(1, 1).scale(0.8, 2.4, 0.8).translate(0, 3.1, 0), color: '#3b6b3f' },
    ]),
    // Orange tree.
    mergeColored([
      { geo: trunk(1.6), color: TRUNK },
      { geo: ico(1.3, 0, 2.9, 0, 1), color: '#4b8a3c' },
      ...fruitDirs.map(([x, y, z]) => {
        const len = Math.hypot(x, y, z);
        return { geo: ico(0.17, (x / len) * 1.3, 2.9 + (y / len) * 1.3, (z / len) * 1.3), color: '#ff9a1f' };
      }),
    ]),
  ];
}

function flowerGeometries(): { stem: THREE.BufferGeometry; head: THREE.BufferGeometry } {
  const stem = mergeColored([
    { geo: new THREE.BoxGeometry(0.035, 0.5, 0.035).translate(0, 0.25, 0), color: '#3f8a34' },
    { geo: new THREE.OctahedronGeometry(0.07, 0).scale(1.6, 0.3, 0.7).translate(0.08, 0.22, 0), color: '#4c9a3c' },
  ]);
  const head = mergeColored([
    { geo: new THREE.OctahedronGeometry(0.13, 0).scale(1, 0.4, 1).translate(0, 0.52, 0), color: '#ffffff' },
    { geo: new THREE.OctahedronGeometry(0.05, 0).translate(0, 0.56, 0), color: '#ffe066' },
  ]);
  return { stem, head };
}

/** Butterfly facing +X: a thin body with two wings spread along +-Z. */
function butterflyGeometry(): THREE.BufferGeometry {
  const wing = (sign: number) => {
    const g = new THREE.BufferGeometry();
    const s = sign;
    g.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(
        [0.12, 0, 0.02 * s, -0.1, 0, 0.02 * s, 0.14, 0, 0.2 * s, -0.1, 0, 0.02 * s, -0.12, 0, 0.16 * s, 0.14, 0, 0.2 * s],
        3,
      ),
    );
    g.computeVertexNormals();
    return g;
  };
  const body = new THREE.BoxGeometry(0.2, 0.03, 0.03);
  body.deleteAttribute('uv');
  return mergeColored([
    { geo: wing(1), color: '#ffffff' },
    { geo: wing(-1), color: '#ffffff' },
    { geo: body, color: '#2a2320' },
  ]);
}

/** Pigeon facing +X. */
function pigeonGeometry(): THREE.BufferGeometry {
  return mergeColored([
    { geo: new THREE.BoxGeometry(0.42, 0.22, 0.24).translate(0, 0.2, 0), color: '#8e939c' },
    { geo: new THREE.BoxGeometry(0.3, 0.06, 0.3).translate(-0.02, 0.28, 0), color: '#7b8089' },
    { geo: new THREE.BoxGeometry(0.15, 0.15, 0.14).translate(0.24, 0.35, 0), color: '#56656e' },
    { geo: new THREE.BoxGeometry(0.08, 0.04, 0.04).translate(0.34, 0.34, 0), color: '#e2a33a' },
    { geo: new THREE.BoxGeometry(0.18, 0.05, 0.18).translate(-0.28, 0.24, 0), color: '#6e737b' },
    { geo: new THREE.BoxGeometry(0.03, 0.1, 0.03).translate(0.02, 0.05, 0.06), color: '#d98a6a' },
    { geo: new THREE.BoxGeometry(0.03, 0.1, 0.03).translate(0.02, 0.05, -0.06), color: '#d98a6a' },
  ]);
}

/** Pinwheel rotor in the XY plane (faces +Z), spinning around Z. */
function rotorGeometry(): THREE.BufferGeometry {
  const colors = ['#ff4f6d', '#ffd23f', '#4ad6ff', '#6dff8a'];
  const parts: Part[] = colors.map((color, i) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, 0.32, 0.02, 0, 0.3, 0.22, 0.04], 3));
    g.computeVertexNormals();
    g.rotateZ((i * Math.PI) / 2);
    return { geo: g, color };
  });
  parts.push({ geo: new THREE.SphereGeometry(0.04, 6, 4).translate(0, 0, 0.03), color: '#ffffff' });
  return mergeColored(parts);
}

/**
 * MeshStandardMaterial whose vertices bend with a shared time uniform, scaled by height above
 * `pivot`, so instanced plants sway in the wind (phase varies per instance position).
 */
function swayMaterial(
  params: THREE.MeshStandardMaterialParameters,
  uTime: { value: number },
  amount: number,
  pivot: number,
  freq: number,
): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial(params);
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 swayBase = instanceMatrix[3].xyz;
        #else
          vec3 swayBase = vec3(0.0);
        #endif
        float swayH = max(transformed.y - ${pivot.toFixed(3)}, 0.0);
        float swayP = uTime * ${freq.toFixed(3)} + swayBase.x * 0.37 + swayBase.z * 0.23;
        transformed.x += sin(swayP) * swayH * ${amount.toFixed(4)};
        transformed.z += cos(swayP * 0.8) * swayH * ${(amount * 0.6).toFixed(4)};`,
      );
  };
  mat.customProgramCacheKey = () => `sway-${amount}-${pivot}-${freq}`;
  return mat;
}

/** Wings (vertices away from the body along Z) flap up and down. */
function flapMaterial(uTime: { value: number }): THREE.MeshStandardMaterial {
  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    roughness: 0.6,
    emissive: '#222222',
  });
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = uTime;
    shader.vertexShader =
      'uniform float uTime;\n' +
      shader.vertexShader.replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 flapBase = instanceMatrix[3].xyz;
        #else
          vec3 flapBase = vec3(0.0);
        #endif
        float flap = sin(uTime * 22.0 + flapBase.x * 3.1 + flapBase.z * 1.7);
        float w = abs(transformed.z);
        transformed.y += w * flap * 1.3;
        transformed.z *= 1.0 - 0.3 * abs(flap);`,
      );
  };
  mat.customProgramCacheKey = () => 'flap';
  return mat;
}

interface Butterfly {
  hx: number;
  hz: number;
  y: number;
  r: number;
  speed: number;
  phase: number;
  px: number;
  pz: number;
}

interface Pigeon {
  pos: THREE.Vector3;
  baseY: number;
  yaw: number;
  phase: number;
  flying: boolean;
  vel: THREE.Vector3;
  gone: boolean;
}

interface Pinwheel {
  pos: THREE.Vector3;
  yaw: number;
  angle: number;
  speed: number;
  boost: number;
}

/** Animated decorations of one road segment. */
export interface SegmentDecor {
  butterflies: Butterfly[];
  butterflyMesh: THREE.InstancedMesh | null;
  pigeons: Pigeon[];
  pigeonMesh: THREE.InstancedMesh | null;
  pinwheels: Pinwheel[];
  rotorMesh: THREE.InstancedMesh | null;
}

/**
 * Trees, bushes and flowers on a garden strip beside the sidewalk, plus small animated
 * life: swaying plants, butterflies, pigeons that scatter from the car, and pinwheels.
 */
export class Decor {
  readonly uTime = { value: 0 };
  private time = 0;
  private active = new Set<SegmentDecor>();

  private treeGeos = treeGeometries();
  private treeMat = swayMaterial({ vertexColors: true, flatShading: true, roughness: 0.9 }, this.uTime, 0.045, 1.2, 1.3);
  private bushGeo = new THREE.IcosahedronGeometry(0.75, 1).scale(1, 0.7, 1).translate(0, 0.45, 0);
  private bushMat = swayMaterial({ color: '#ffffff', flatShading: true, roughness: 0.95 }, this.uTime, 0.05, 0.2, 1.7);
  private flower = flowerGeometries();
  private flowerMat = swayMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }, this.uTime, 0.3, 0.0, 2.4);
  private stickGeo = new THREE.CylinderGeometry(0.02, 0.02, 1.1, 4).translate(0, 0.55, 0);
  private stickMat = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.8 });
  private rotorGeo = rotorGeometry();
  private rotorMat = new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.5, emissive: '#1a1a1a' });
  private butterflyGeo = butterflyGeometry();
  private butterflyMat = flapMaterial(this.uTime);
  private pigeonGeo = pigeonGeometry();
  private pigeonMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85 });

  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private q2 = new THREE.Quaternion();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private color = new THREE.Color();

  /** Builds the static plants and the animated creatures for one segment. */
  build(seg: Segment, rng: () => number, group: THREE.Group, instanced: THREE.InstancedMesh[]): SegmentDecor {
    const inner = ROAD.halfWidth + ROAD.sidewalkWidth;
    const trees: Array<{ type: number; m: THREE.Matrix4; color: THREE.Color }> = [];
    const bushes: Array<{ m: THREE.Matrix4; color: THREE.Color }> = [];
    const flowers: Array<{ m: THREE.Matrix4; color: THREE.Color }> = [];
    const sticks: THREE.Matrix4[] = [];
    const decor: SegmentDecor = { butterflies: [], butterflyMesh: null, pigeons: [], pigeonMesh: null, pinwheels: [], rotorMesh: null };

    const at = (t: number, lat: number, y = 0.1) => {
      const p = pointOnSegment(seg, t);
      const rx = -Math.sin(p.heading);
      const rz = Math.cos(p.heading);
      return { pos: new THREE.Vector3(p.x + rx * lat, y, p.z + rz * lat), heading: p.heading, rx, rz };
    };
    const compose = (pos: THREE.Vector3, yaw: number, scale: number) =>
      new THREE.Matrix4().compose(pos, new THREE.Quaternion().setFromAxisAngle(UP, yaw), new THREE.Vector3(scale, scale, scale));
    const tint = (base: THREE.ColorRepresentation, spread: number) => {
      const c = new THREE.Color(base);
      const k = 1 + (rng() - 0.5) * spread;
      return c.multiplyScalar(k);
    };

    for (const side of [-1, 1]) {
      // Trees, with bushes in between.
      const treeTs: number[] = [];
      for (let t = randRange(rng, 2, 8); t < seg.length - 2; t += randRange(rng, 9, 15)) {
        const lat = side * (inner + VERGE_WIDTH * 0.5 + randRange(rng, -0.3, 0.3));
        const { pos } = at(t, lat, 0.1);
        trees.push({ type: Math.floor(rng() * this.treeGeos.length), m: compose(pos, rng() * Math.PI * 2, randRange(rng, 0.8, 1.25)), color: tint('#ffffff', 0.25) });
        treeTs.push(t);
        if (rng() < 0.55 && t + 5 < seg.length) {
          const b = at(t + randRange(rng, 4, 6), side * (inner + VERGE_WIDTH - 0.6), 0.1);
          bushes.push({ m: compose(b.pos, rng() * Math.PI * 2, randRange(rng, 0.7, 1.2)), color: tint(BUSH_COLORS[Math.floor(rng() * BUSH_COLORS.length)], 0.2) });
        }
      }

      // Flower clumps, one color each, kept away from tree trunks.
      for (let t = randRange(rng, 0.5, 2); t < seg.length; t += randRange(rng, 1.6, 2.8)) {
        const cLat = inner + randRange(rng, 0.35, VERGE_WIDTH - 0.35);
        if (treeTs.some((tt) => Math.abs(tt - t) < 1) && Math.abs(cLat - (inner + VERGE_WIDTH * 0.5)) < 0.8) continue;
        const base = FLOWER_COLORS[Math.floor(rng() * FLOWER_COLORS.length)];
        const n = 3 + Math.floor(rng() * 4);
        for (let k = 0; k < n; k++) {
          const f = at(t + randRange(rng, -0.4, 0.4), side * (cLat + randRange(rng, -0.35, 0.35)), 0.1);
          flowers.push({ m: compose(f.pos, rng() * Math.PI * 2, randRange(rng, 0.8, 1.35)), color: tint(base, 0.2) });
        }
      }

      // Pinwheels at the sidewalk edge of the garden, facing the road.
      for (let t = randRange(rng, 10, 30); t < seg.length; t += randRange(rng, 30, 55)) {
        if (rng() < 0.4) continue;
        const { pos, rx, rz } = at(t, side * (inner + 0.3), 0.1);
        sticks.push(compose(pos, 0, 1));
        decor.pinwheels.push({
          pos: pos.clone().add(new THREE.Vector3(0, 1.1, 0)),
          yaw: Math.atan2(-side * rx, -side * rz),
          angle: rng() * Math.PI * 2,
          speed: randRange(rng, 1.5, 3.5) * (rng() < 0.5 ? -1 : 1),
          boost: 0,
        });
      }

      // Butterflies wandering over the flowers.
      const nb = 3 + Math.floor(rng() * 4);
      for (let k = 0; k < nb; k++) {
        const { pos } = at(randRange(rng, 0, seg.length), side * (inner + VERGE_WIDTH * 0.5), 0);
        decor.butterflies.push({
          hx: pos.x,
          hz: pos.z,
          y: randRange(rng, 0.7, 1.8),
          r: randRange(rng, 0.8, 2.2),
          speed: randRange(rng, 0.6, 1.4),
          phase: rng() * 100,
          px: pos.x,
          pz: pos.z,
        });
      }

      // Pigeon flocks on the sidewalk.
      for (let t = randRange(rng, 15, 40); t < seg.length - 3; t += randRange(rng, 40, 70)) {
        if (rng() < 0.5) continue;
        const n = 3 + Math.floor(rng() * 3);
        for (let k = 0; k < n; k++) {
          const { pos } = at(t + randRange(rng, -2, 2), side * (ROAD.halfWidth + randRange(rng, 1.4, ROAD.sidewalkWidth - 0.4)), 0.16);
          decor.pigeons.push({ pos, baseY: 0.16, yaw: rng() * Math.PI * 2, phase: rng() * 100, flying: false, vel: new THREE.Vector3(), gone: false });
        }
      }
    }

    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, list: Array<{ m: THREE.Matrix4; color?: THREE.Color }>) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        if (it.color) mesh.setColorAt(i, it.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      instanced.push(mesh);
    };
    this.treeGeos.forEach((geo, type) => add(geo, this.treeMat, trees.filter((t) => t.type === type)));
    add(this.bushGeo, this.bushMat, bushes);
    add(this.flower.stem, this.flowerMat, flowers.map((f) => ({ m: f.m })));
    add(this.flower.head, this.flowerMat, flowers);
    add(this.stickGeo, this.stickMat, sticks.map((m) => ({ m })));

    const dynamic = (geo: THREE.BufferGeometry, mat: THREE.Material, count: number) => {
      if (!count) return null;
      const mesh = new THREE.InstancedMesh(geo, mat, count);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      mesh.frustumCulled = false;
      group.add(mesh);
      instanced.push(mesh);
      return mesh;
    };
    decor.rotorMesh = dynamic(this.rotorGeo, this.rotorMat, decor.pinwheels.length);
    decor.pigeonMesh = dynamic(this.pigeonGeo, this.pigeonMat, decor.pigeons.length);
    decor.butterflyMesh = dynamic(this.butterflyGeo, this.butterflyMat, decor.butterflies.length);
    if (decor.butterflyMesh) {
      decor.butterflies.forEach((_, i) => {
        this.color.set(BUTTERFLY_COLORS[Math.floor(rng() * BUTTERFLY_COLORS.length)]);
        decor.butterflyMesh!.setColorAt(i, this.color);
      });
      decor.butterflyMesh.instanceColor!.needsUpdate = true;
    }

    this.animateSegment(decor, 0, null);
    this.active.add(decor);
    return decor;
  }

  release(decor: SegmentDecor) {
    this.active.delete(decor);
  }

  update(dt: number, car: THREE.Vector3) {
    this.time += dt;
    this.uTime.value = this.time;
    for (const d of this.active) this.animateSegment(d, dt, car);
  }

  private animateSegment(d: SegmentDecor, dt: number, car: THREE.Vector3 | null) {
    const time = this.time;

    if (d.rotorMesh) {
      d.pinwheels.forEach((p, i) => {
        if (car && p.pos.distanceToSquared(car) < 12 * 12) p.boost = 14;
        p.boost = Math.max(0, p.boost - dt * 5);
        p.angle += (p.speed + Math.sign(p.speed) * p.boost) * dt;
        this.q.setFromAxisAngle(UP, p.yaw).multiply(this.q2.setFromAxisAngle(AXIS_Z, p.angle));
        this.m.compose(p.pos, this.q, this.s.set(1, 1, 1));
        d.rotorMesh!.setMatrixAt(i, this.m);
      });
      d.rotorMesh.instanceMatrix.needsUpdate = true;
    }

    if (d.butterflyMesh) {
      d.butterflies.forEach((b, i) => {
        const t = time * b.speed + b.phase;
        const x = b.hx + Math.cos(t) * b.r + Math.sin(t * 2.7) * 0.3;
        const z = b.hz + Math.sin(t * 1.3) * b.r;
        const y = b.y + Math.sin(time * 3.1 + b.phase) * 0.25;
        const dx = x - b.px;
        const dz = z - b.pz;
        b.px = x;
        b.pz = z;
        const yaw = dx || dz ? Math.atan2(-dz, dx) : 0;
        this.m.compose(this.v.set(x, y, z), this.q.setFromAxisAngle(UP, yaw), this.s.set(1, 1, 1));
        d.butterflyMesh!.setMatrixAt(i, this.m);
      });
      d.butterflyMesh.instanceMatrix.needsUpdate = true;
    }

    if (d.pigeonMesh) {
      d.pigeons.forEach((p, i) => {
        let pitch = 0;
        let roll = 0;
        let yaw = p.yaw;
        if (!p.flying && car) {
          const dx = p.pos.x - car.x;
          const dz = p.pos.z - car.z;
          if (dx * dx + dz * dz < 16 * 16) {
            p.flying = true;
            const len = Math.hypot(dx, dz) || 1;
            p.vel.set((dx / len) * randRange(Math.random, 2, 4), randRange(Math.random, 3, 5), (dz / len) * randRange(Math.random, 2, 4));
            p.yaw = Math.atan2(-p.vel.z, p.vel.x);
          }
        }
        if (p.flying) {
          p.vel.y = Math.min(p.vel.y + 3 * dt, 8);
          p.pos.addScaledVector(p.vel, dt);
          yaw = p.yaw;
          pitch = 0.35;
          roll = Math.sin(time * 35 + p.phase) * 0.35;
          if (p.pos.y > 45) p.gone = true;
        } else {
          pitch = -Math.pow(Math.max(0, Math.sin(time * 5 + p.phase)), 6) * 0.7;
          p.pos.y = p.baseY + Math.pow(Math.max(0, Math.sin(time * 2.3 + p.phase * 3)), 20) * 0.12;
          yaw = p.yaw + Math.sin(time * 0.5 + p.phase) * 0.6;
        }
        this.q
          .setFromAxisAngle(UP, yaw)
          .multiply(this.q2.setFromAxisAngle(AXIS_Z, pitch))
          .multiply(this.q2.setFromAxisAngle(AXIS_X, roll));
        const sc = p.gone ? 0 : 1;
        this.m.compose(p.pos, this.q, this.s.set(sc, sc, sc));
        d.pigeonMesh!.setMatrixAt(i, this.m);
      });
      d.pigeonMesh.instanceMatrix.needsUpdate = true;
    }
  }
}
