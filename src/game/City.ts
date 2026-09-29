import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { BILLBOARD_ASPECT, Billboards } from './Billboards';
import { Decor, VERGE_WIDTH, type SegmentDecor } from './Decor';
import { mulberry32, randRange } from './rng';
import { pointOnSegment, ROAD, type Segment, type Track } from './Track';

/** Rotation around Y that maps local +X onto the XZ direction (dx, dz). */
function yawFromDir(dx: number, dz: number): number {
  return Math.atan2(-dz, dx);
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function roadTexture(): THREE.CanvasTexture {
  const [c, ctx] = makeCanvas(256, 512);
  ctx.fillStyle = '#2c2f36';
  ctx.fillRect(0, 0, 256, 512);
  const rng = mulberry32(99);
  for (let i = 0; i < 2500; i++) {
    const v = 36 + Math.floor(rng() * 22);
    ctx.fillStyle = `rgb(${v},${v + 2},${v + 6})`;
    ctx.fillRect(rng() * 256, rng() * 512, 2, 2);
  }
  ctx.fillStyle = '#e8e8e8';
  ctx.fillRect(6, 0, 6, 512);
  ctx.fillRect(244, 0, 6, 512);
  for (const u of [1 / 3, 2 / 3]) {
    ctx.fillRect(u * 256 - 3, 0, 6, 256);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.ClampToEdgeWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

function facadeTextures(): { map: THREE.CanvasTexture; emissive: THREE.CanvasTexture } {
  const size = 256;
  const [c1, a] = makeCanvas(size, size);
  const [c2, b] = makeCanvas(size, size);
  a.fillStyle = '#c9c4bb';
  a.fillRect(0, 0, size, size);
  b.fillStyle = '#000';
  b.fillRect(0, 0, size, size);
  const rng = mulberry32(7);
  const cols = 4;
  const rows = 4;
  const cw = size / cols;
  const rh = size / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rng() < 0.45;
      const px = x * cw + cw * 0.18;
      const py = y * rh + rh * 0.2;
      const w = cw * 0.64;
      const h = rh * 0.55;
      a.fillStyle = lit ? '#ffe7a8' : '#3b4656';
      a.fillRect(px, py, w, h);
      if (lit) {
        b.fillStyle = rng() < 0.3 ? '#bfe3ff' : '#ffd98a';
        b.fillRect(px, py, w, h);
      }
    }
  }
  const map = new THREE.CanvasTexture(c1);
  const emissive = new THREE.CanvasTexture(c2);
  for (const t of [map, emissive]) {
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
  }
  return { map, emissive };
}

/** A flat strip along a segment between lateral offsets [left, right]. */
function ribbon(seg: Segment, left: number, right: number, y: number, vScale: number): THREE.BufferGeometry {
  const n = seg.kind === 'straight' ? 1 : Math.max(8, Math.ceil(seg.length / 2));
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const t = (seg.length * i) / n;
    const p = pointOnSegment(seg, t);
    const rx = -Math.sin(p.heading);
    const rz = Math.cos(p.heading);
    const v = (seg.s0 + t) / vScale;
    pos.push(p.x + rx * left, y, p.z + rz * left, p.x + rx * right, y, p.z + rz * right);
    uv.push(0, v, 1, v);
    if (i < n) {
      const k = i * 2;
      idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

interface BuiltSegment {
  group: THREE.Group;
  geometries: THREE.BufferGeometry[];
  instanced: THREE.InstancedMesh[];
  decor: SegmentDecor;
}

const HEIGHT_BUCKETS = [
  { max: 22, repeatY: 2 },
  { max: 42, repeatY: 4 },
  { max: Infinity, repeatY: 7 },
];

const BUILDING_COLORS = ['#ffffff', '#e9dccb', '#cfd8e3', '#d9c2b0', '#bfc9c2', '#f1e3d3', '#a9b4c2'];

export class City {
  readonly group = new THREE.Group();
  private built = new Map<number, BuiltSegment>();
  private rng: () => number;

  private roadMat: THREE.MeshStandardMaterial;
  private sidewalkMat = new THREE.MeshStandardMaterial({ color: '#8d9099', roughness: 0.95 });
  private curbMat = new THREE.MeshStandardMaterial({ color: '#b9bcc4', roughness: 0.9 });
  private grassMat = new THREE.MeshStandardMaterial({ color: '#4f7f3c', roughness: 1 });
  private decor = new Decor();
  private billboards = new Billboards();
  private buildingMats: THREE.Material[][];
  private boxGeo: THREE.BoxGeometry;
  private poleGeo: THREE.BufferGeometry;
  private poleMat = new THREE.MeshStandardMaterial({ color: '#3a3f47', metalness: 0.6, roughness: 0.5 });
  private lampGeo = new THREE.BoxGeometry(0.9, 0.18, 0.45);
  private lampMat = new THREE.MeshStandardMaterial({ color: '#fff3c4', emissive: '#ffe08a', emissiveIntensity: 2 });
  private ground: THREE.Mesh;

  constructor(seed = 1) {
    this.rng = mulberry32(seed * 7919 + 13);
    const tex = roadTexture();
    this.roadMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 });

    const facade = facadeTextures();
    const roof = new THREE.MeshStandardMaterial({ color: '#4a4d55', roughness: 1 });
    this.buildingMats = HEIGHT_BUCKETS.map((b) => {
      const map = facade.map.clone();
      const em = facade.emissive.clone();
      map.repeat.set(2, b.repeatY);
      em.repeat.set(2, b.repeatY);
      map.needsUpdate = em.needsUpdate = true;
      const side = new THREE.MeshStandardMaterial({
        map,
        emissiveMap: em,
        emissive: new THREE.Color('#ffffff'),
        emissiveIntensity: 0.85,
        roughness: 0.8,
      });
      return [side, side, roof, roof, side, side];
    });
    this.boxGeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);

    const pole = new THREE.CylinderGeometry(0.12, 0.16, 7, 6).translate(0, 3.5, 0);
    const arm = new THREE.BoxGeometry(2.4, 0.12, 0.12).translate(-1.1, 7, 0);
    this.poleGeo = mergeGeometries([pole.toNonIndexed(), arm.toNonIndexed()])!;
    pole.dispose();
    arm.dispose();

    this.ground = new THREE.Mesh(
      new THREE.PlaneGeometry(3000, 3000).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: '#40463f', roughness: 1 }),
    );
    this.ground.position.y = -0.02;
    this.group.add(this.ground);
  }

  /** Builds visuals for new segments (once their neighbors exist) and removes old ones. */
  update(track: Track, focus: THREE.Vector3): void {
    const segs = track.segments;
    const alive = new Set(segs.map((s) => s.id));
    for (const [id, b] of this.built) {
      if (!alive.has(id)) {
        this.disposeSegment(b);
        this.built.delete(id);
      }
    }
    for (let i = 0; i < segs.length - 2; i++) {
      if (!this.built.has(segs[i].id)) this.buildSegment(segs[i], track);
    }
    this.ground.position.x = Math.round(focus.x / 50) * 50;
    this.ground.position.z = Math.round(focus.z / 50) * 50;
  }

  /** Advances plant sway and roadside creatures; `car` lets pigeons and pinwheels react to it. */
  animate(dt: number, car: THREE.Vector3): void {
    this.decor.update(dt, car);
  }

  clear(): void {
    for (const b of this.built.values()) this.disposeSegment(b);
    this.built.clear();
  }

  private disposeSegment(b: BuiltSegment) {
    this.decor.release(b.decor);
    this.group.remove(b.group);
    b.geometries.forEach((g) => g.dispose());
    b.instanced.forEach((m) => m.dispose());
  }

  private buildSegment(seg: Segment, track: Track) {
    const group = new THREE.Group();
    const geometries: THREE.BufferGeometry[] = [];
    const instanced: THREE.InstancedMesh[] = [];
    const hw = ROAD.halfWidth;
    const sw = ROAD.sidewalkWidth;

    const road = ribbon(seg, -hw, hw, 0.02, 12);
    geometries.push(road);
    group.add(new THREE.Mesh(road, this.roadMat));
    for (const side of [-1, 1]) {
      const walk = ribbon(seg, side < 0 ? -hw - sw : hw + 0.25, side < 0 ? -hw - 0.25 : hw + sw, 0.16, 10);
      const curb = ribbon(seg, side < 0 ? -hw - 0.25 : hw, side < 0 ? -hw : hw + 0.25, 0.18, 10);
      const vergeIn = hw + sw;
      const verge = ribbon(seg, side < 0 ? -vergeIn - VERGE_WIDTH : vergeIn, side < 0 ? -vergeIn : vergeIn + VERGE_WIDTH, 0.1, 10);
      geometries.push(walk, curb, verge);
      group.add(new THREE.Mesh(walk, this.sidewalkMat), new THREE.Mesh(curb, this.curbMat), new THREE.Mesh(verge, this.grassMat));
    }

    this.addBuildings(seg, track, group, instanced);
    this.addStreetProps(seg, group, instanced);
    const decor = this.decor.build(seg, this.rng, group, instanced);

    this.group.add(group);
    this.built.set(seg.id, { group, geometries, instanced, decor });
  }

  private addBuildings(seg: Segment, track: Track, group: THREE.Group, instanced: THREE.InstancedMesh[]) {
    const rng = this.rng;
    const clearance = ROAD.halfWidth + ROAD.sidewalkWidth + VERGE_WIDTH + 0.8;
    type B = { m: THREE.Matrix4; color: THREE.Color };
    const buckets: B[][] = HEIGHT_BUCKETS.map(() => []);
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    for (const side of [-1, 1]) {
      for (const row of [0, 1]) {
        let t = randRange(rng, 0, 6);
        while (t < seg.length) {
          const w = randRange(rng, 9, 20);
          const d = randRange(rng, 10, 20);
          const tc = Math.min(t + w / 2, seg.length);
          t += w + randRange(rng, 1.5, 5);
          if (rng() < 0.08) continue;
          const p = pointOnSegment(seg, tc);
          const lateral = side * (clearance + row * 24 + d / 2 + randRange(rng, 0, 3));
          const cx = p.x - Math.sin(p.heading) * lateral;
          const cz = p.z + Math.cos(p.heading) * lateral;
          const radius = 0.5 * Math.hypot(w, d);
          if (track.distanceToCenterline(cx, cz) - radius < clearance - 0.5) continue;
          const tall = row === 1 ? 1.4 : 1;
          const r = rng();
          const h = (r < 0.45 ? randRange(rng, 10, 22) : r < 0.85 ? randRange(rng, 22, 42) : randRange(rng, 42, 80)) * tall;
          const bucket = HEIGHT_BUCKETS.findIndex((b) => h <= b.max);
          q.setFromAxisAngle(up, yawFromDir(Math.cos(p.heading), Math.sin(p.heading)));
          const m = new THREE.Matrix4().compose(new THREE.Vector3(cx, 0, cz), q, new THREE.Vector3(w, h, d));
          const color = new THREE.Color(BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)]);
          buckets[bucket].push({ m, color });
          if (row === 0 && h <= 26 && w >= 9 && rng() < 0.25) {
            this.addRooftopBillboard(group, cx, cz, h, w, p.heading, side);
          }
        }
      }
    }

    buckets.forEach((list, bi) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(this.boxGeo, this.buildingMats[bi], list.length);
      list.forEach((b, i) => {
        mesh.setMatrixAt(i, b.m);
        mesh.setColorAt(i, b.color);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      instanced.push(mesh);
    });
  }

  /** A "Jesus Loves You" billboard on a roof, angled toward the road and oncoming traffic. */
  private addRooftopBillboard(group: THREE.Group, cx: number, cz: number, roofY: number, w: number, heading: number, side: number) {
    const width = THREE.MathUtils.clamp(w * 0.85, 7, 11);
    const postHeight = 1.6;
    const fx = -Math.cos(heading) * 0.75 + side * Math.sin(heading) * 0.66;
    const fz = -Math.sin(heading) * 0.75 - side * Math.cos(heading) * 0.66;
    const center = new THREE.Vector3(cx, roofY + postHeight + (width * BILLBOARD_ASPECT) / 2, cz);
    group.add(this.billboards.create(center, Math.atan2(fx, fz), width, postHeight));
  }

  private addStreetProps(seg: Segment, group: THREE.Group, instanced: THREE.InstancedMesh[]) {
    const hw = ROAD.halfWidth;
    const poles: THREE.Matrix4[] = [];
    const lamps: THREE.Matrix4[] = [];
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const spacing = 34;
    const first = (spacing - (seg.s0 % spacing)) % spacing;
    for (let t = first; t < seg.length; t += spacing) {
      const p = pointOnSegment(seg, t);
      const rx = -Math.sin(p.heading);
      const rz = Math.cos(p.heading);
      for (const side of [-1, 1]) {
        const lat = side * (hw + 0.7);
        q.setFromAxisAngle(up, yawFromDir(side * rx, side * rz));
        const base = new THREE.Vector3(p.x + rx * lat, 0.16, p.z + rz * lat);
        poles.push(new THREE.Matrix4().compose(base, q, new THREE.Vector3(1, 1, 1)));
        const lampPos = base.clone().add(new THREE.Vector3(-side * rx * 2.2, 6.85, -side * rz * 2.2));
        lamps.push(new THREE.Matrix4().compose(lampPos, q, new THREE.Vector3(1, 1, 1)));
      }
    }
    const add = (geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[]) => {
      if (!list.length) return;
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((m, i) => mesh.setMatrixAt(i, m));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      group.add(mesh);
      instanced.push(mesh);
    };
    add(this.poleGeo, this.poleMat, poles);
    add(this.lampGeo, this.lampMat, lamps);
  }
}
