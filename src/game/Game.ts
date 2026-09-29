import * as THREE from 'three';
import { challengeOptions, type Passage } from '../data/passage';
import type { Hud } from '../ui/Hud';
import { Car, type CarControls } from './Car';
import { Checkpoint, SIGN_LEAD, type CrossingResult } from './Checkpoint';
import { City } from './City';
import type { Input } from './input';
import { Particles } from './Particles';
import { mulberry32 } from './rng';
import { laneCenter, ROAD, Track } from './Track';

export type GameState = 'menu' | 'playing' | 'paused' | 'finished';

export interface GameOptions {
  debug: boolean;
  /** Debug autopilot: drive to the correct gate, or first try a wrong gate at each checkpoint. */
  auto: false | 'correct' | 'wrong';
  fast: boolean;
  seed?: number;
}

/** Minimum distance from the car to a newly spawned checkpoint gate. */
const SPAWN_AHEAD = 90;
/** Minimum distance between consecutive gates. */
const GATE_GAP = 100;
const START_S = 20;
const SKY_TOP = new THREE.Color('#2f63b0');
const SKY_HORIZON = new THREE.Color('#f0c6a0');
const CONFETTI = ['#ffd84a', '#8dffb0', '#45e07a', '#ffffff', '#fff3a8'];
const RAINBOW = ['#ff5a5a', '#ffb347', '#ffe14d', '#6dff8a', '#4ad6ff', '#8a7bff', '#ff7ad9', '#ffffff'];

export class Game {
  state: GameState = 'menu';
  passage: Passage | null = null;
  challengeIndex = 0;
  mistakes = 0;
  elapsed = 0;

  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(62, 1, 0.1, 2000);
  track: Track;
  readonly car = new Car();
  private city: City;
  private sky: THREE.Mesh;
  private sun = new THREE.DirectionalLight('#fff1dd', 2.2);
  private active: Checkpoint | null = null;
  private passed: Checkpoint[] = [];
  private lastGate = 0;
  private rng = mulberry32(Date.now() >>> 0);
  private autoWrongDone = new WeakSet<Checkpoint>();
  private finishTimer = 0;
  private particles = new Particles();
  private sparkleTimer = 0;
  private sparkleColors = CONFETTI;
  private tmpVec = new THREE.Vector3();
  private lastFrameTime: number | null = null;
  private fps = 0;
  private debugEl = document.getElementById('debug')!;

  constructor(
    private container: HTMLElement,
    private hud: Hud,
    private input: Input,
    private options: GameOptions,
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: options.debug });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    container.appendChild(this.renderer.domElement);

    this.scene.fog = new THREE.Fog(SKY_HORIZON, 160, 640);
    this.scene.background = SKY_HORIZON;
    this.sky = this.makeSky();
    this.scene.add(this.sky);
    this.scene.add(new THREE.HemisphereLight('#bcd4ff', '#4a4038', 1.3));
    this.scene.add(this.sun, this.sun.target);

    this.track = new Track(this.seed());
    this.city = new City(this.seed());
    this.scene.add(this.city.group, this.car.object, this.particles.points);
    this.car.reset(START_S, laneCenter(1));
    if (options.fast) this.car.maxSpeed = 60;

    window.addEventListener('resize', () => this.resize());
    this.resize();
    this.debugEl.classList.toggle('hidden', !options.debug);
    if (options.debug) (window as unknown as { __game: Game }).__game = this;
  }

  private seed(): number {
    return this.options.seed ?? Math.floor(Math.random() * 1e9);
  }

  private makeSky(): THREE.Mesh {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: { top: { value: SKY_TOP }, horizon: { value: SKY_HORIZON } },
      vertexShader: `varying vec3 vDir;
        void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; varying vec3 vDir;
        void main() { float h = clamp(vDir.y, 0.0, 1.0); gl_FragColor = vec4(mix(horizon, top, smoothstep(0.0, 0.45, h)), 1.0);
        #include <colorspace_fragment>
        }`,
    });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 32, 16), mat);
    sky.renderOrder = -1;
    return sky;
  }

  resize() {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.particles.setViewport(h * this.renderer.getPixelRatio(), this.camera.fov);
  }

  run() {
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Starts a new run of `passage` on a fresh track. */
  start(passage: Passage) {
    this.passage = passage;
    this.resetWorld();
    this.challengeIndex = 0;
    this.mistakes = 0;
    this.elapsed = 0;
    this.lastGate = 0;
    this.state = 'playing';
    this.hud.setPassage(passage);
    this.hud.showScreen('playing');
    this.hud.update(passage, 0, 0, 0, 0);
    this.spawnNext();
    this.hud.toast('出發！按 <b>W</b>／<b>↑</b> 加速 · Go!', 'info', 2200);
  }

  restart() {
    if (this.passage) this.start(this.passage);
  }

  toMenu() {
    this.clearCheckpoints();
    this.state = 'menu';
    this.hud.showScreen('start');
  }

  togglePause() {
    if (this.state === 'playing') {
      this.state = 'paused';
      this.hud.showScreen('paused');
    } else if (this.state === 'paused') {
      this.state = 'playing';
      this.hud.showScreen('playing');
    }
  }

  private clearCheckpoints() {
    this.active?.dispose();
    this.active = null;
    this.passed.forEach((c) => c.dispose());
    this.passed = [];
  }

  private resetWorld() {
    this.clearCheckpoints();
    this.particles.clear();
    this.sparkleTimer = 0;
    this.city.clear();
    this.track = new Track(this.seed());
    this.car.reset(START_S, laneCenter(1));
    this.updateWorld();
  }

  private spawnNext() {
    const p = this.passage!;
    if (this.challengeIndex >= p.challenges.length) return;
    const minS = Math.max(this.car.s + SPAWN_AHEAD, this.lastGate + GATE_GAP);
    const gate = this.track.findStraightSlot(minS, SIGN_LEAD + 55, 25);
    const challenge = p.challenges[this.challengeIndex];
    const cp = new Checkpoint(this.track, gate, p, challenge, challengeOptions(challenge, this.rng));
    this.scene.add(cp.group);
    this.active = cp;
    this.lastGate = gate;
  }

  private updateWorld() {
    this.track.ensureAhead(this.car.s + 1100);
    this.track.trimBefore(this.car.s - 170);
    this.city.update(this.track, this.car.position);
  }

  private autopilot(targetSpeed: number): CarControls {
    const cp = this.active;
    let lane = 1;
    if (cp) {
      lane = cp.correctLane;
      if (this.options.auto === 'wrong' && !this.autoWrongDone.has(cp)) {
        lane = [0, 1, 2].find((l) => l !== cp.correctLane && !cp.isBarred(l)) ?? cp.correctLane;
      }
    }
    const steer = THREE.MathUtils.clamp((laneCenter(lane) - this.car.offset) * 0.9, -1, 1);
    const throttle = this.car.speed < targetSpeed - 0.5 ? 1 : this.car.speed > targetSpeed + 2 ? -1 : 0;
    return { throttle, steer };
  }

  private frame(time: number) {
    const dt = this.lastFrameTime === null ? 0 : Math.min((time - this.lastFrameTime) / 1000, 0.05);
    this.lastFrameTime = time;
    this.fps = this.fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;

    if (this.state === 'menu') {
      this.car.update(dt, this.autopilot(14), this.track);
    } else if (this.state === 'playing') {
      this.updatePlaying(dt);
    } else if (this.state === 'finished') {
      this.car.update(dt, this.autopilot(10), this.track);
      if (this.finishTimer > 0) {
        this.finishTimer -= dt;
        if (this.finishTimer <= 0) this.hud.showFinish(this.passage!, { time: this.elapsed, mistakes: this.mistakes });
      }
    }

    if (this.state !== 'paused') {
      this.updateWorld();
      this.city.animate(dt, this.car.position);
      this.active?.update(dt);
      for (const cp of this.passed) cp.update(dt);
      this.passed = this.passed.filter((cp) => {
        if (this.car.s > cp.gateS + 80) {
          cp.dispose();
          return false;
        }
        return true;
      });
      this.updateSparkles(dt);
      this.particles.update(dt);
      this.car.updateCamera(this.camera, dt);
    }

    this.sky.position.copy(this.camera.position);
    this.sun.position.copy(this.car.position).add(new THREE.Vector3(-120, 160, 60));
    this.sun.target.position.copy(this.car.position);
    this.renderer.render(this.scene, this.camera);
    if (this.options.debug) this.updateDebug();
  }

  private updatePlaying(dt: number) {
    const p = this.passage!;
    const controls: CarControls = this.options.auto
      ? this.autopilot(this.car.maxSpeed)
      : { throttle: this.input.throttle, steer: this.input.steer };
    const prevS = this.car.s;
    this.car.update(dt, controls, this.track);
    this.elapsed += dt;

    const cp = this.active;
    const hit = cp?.checkCrossing(prevS, this.car.s, this.car.offset);
    if (cp && hit) {
      if (hit.correct) this.onCorrect(cp);
      else this.onWrong(cp, hit);
    }
    this.hud.update(p, this.challengeIndex, this.elapsed, this.mistakes, this.car.speedKmh);
  }

  private onWrong(cp: Checkpoint, hit: CrossingResult) {
    if (!hit.alreadyBarred) this.mistakes++;
    cp.markWrong(hit.lane);
    this.autoWrongDone.add(cp);
    this.car.bounce(cp.gateS - 1.5, Math.max(10, Math.abs(this.car.speed) * 0.5));
    this.hud.toast(
      `✗ 「${cp.options[hit.lane]}」不對！發光的門是正確答案，再試一次<br><small>Wrong word — the glowing gate is correct. Try again!</small>`,
      'bad',
      2600,
    );
  }

  /** Celebration particles at the solved gate; they inherit the car's velocity so they stay in view. */
  private celebrate(cp: Checkpoint, finale: boolean) {
    const colors = finale ? RAINBOW : CONFETTI;
    const scale = finale ? 2.5 : 1;
    const inherit = this.tmpVec.copy(this.car.forward).multiplyScalar(Math.max(0, this.car.speed));
    const x = laneCenter(cp.correctLane);
    const half = ROAD.laneWidth / 2;

    this.particles.burst({
      origin: cp.worldPoint(x, 3.6, -4),
      count: Math.round(200 * scale),
      colors,
      inherit,
      spread: [3, 10 * (finale ? 1.4 : 1)],
      up: [1, 7],
      jitter: 1,
      size: [0.24, 0.52],
      life: [1.1, 2.0],
      gravity: 6,
      drag: 0.6,
    });
    for (const px of [x - half, x + half]) {
      this.particles.burst({
        origin: cp.worldPoint(px, 1, -2),
        count: Math.round(50 * scale),
        colors,
        inherit,
        spread: [0.5, 2],
        up: [9, 15],
        jitter: 0.2,
        size: [0.18, 0.38],
        life: [1.0, 1.7],
        gravity: 13,
        drag: 0.5,
      });
    }
    this.sparkleTimer = finale ? 3 : 1.2;
    this.sparkleColors = colors;
  }

  /** Sparkle trail streaming off the car for a moment after a correct answer. */
  private updateSparkles(dt: number) {
    if (this.sparkleTimer <= 0 || dt <= 0) return;
    this.sparkleTimer -= dt;
    const origin = this.tmpVec.copy(this.car.position).addScaledVector(this.car.forward, 1.8);
    origin.y = 0.9;
    this.particles.burst({
      origin,
      count: Math.max(1, Math.round(140 * dt)),
      colors: this.sparkleColors,
      inherit: this.car.forward.clone().multiplyScalar(Math.max(0, this.car.speed) * 0.35),
      spread: [0.8, 2.5],
      up: [1, 3.5],
      jitter: 0.9,
      size: [0.12, 0.28],
      life: [0.5, 0.9],
      gravity: 4,
      drag: 1.5,
    });
  }

  private onCorrect(cp: Checkpoint) {
    const p = this.passage!;
    cp.markSolved();
    this.passed.push(cp);
    this.active = null;
    this.challengeIndex++;
    this.celebrate(cp, this.challengeIndex >= p.challenges.length);
    if (this.challengeIndex >= p.challenges.length) {
      this.state = 'finished';
      this.finishTimer = 1.4;
      this.hud.update(p, this.challengeIndex, this.elapsed, this.mistakes, this.car.speedKmh);
      this.hud.toast(`✓ 「${cp.challenge.answer}」 全部完成！ All done!`, 'good', 1600);
      return;
    }
    this.hud.toast(`✓ 「${cp.challenge.answer}」 答對了！ Correct!`, 'good', 1400);
    this.spawnNext();
  }

  private updateDebug() {
    const cp = this.active;
    this.debugEl.textContent =
      `state=${this.state} fps=${this.fps.toFixed(0)} s=${this.car.s.toFixed(1)} off=${this.car.offset.toFixed(2)} ` +
      `v=${this.car.speed.toFixed(1)} challenge=${this.challengeIndex}/${this.passage?.challenges.length ?? 0} ` +
      `mistakes=${this.mistakes} gate=${cp ? cp.gateS.toFixed(0) : '-'} correctLane=${cp ? cp.correctLane : '-'} ` +
      `segs=${this.track.segments.length}`;
  }

  /** Debug helper: teleport the car to `distance` meters before the active gate. */
  debugJumpToGate(distance = 45, lane?: number) {
    const cp = this.active;
    if (!cp) return;
    this.car.s = cp.gateS - distance;
    this.car.speed = Math.min(this.car.maxSpeed, 25);
    if (lane !== undefined) this.car.offset = laneCenter(lane);
  }
}
