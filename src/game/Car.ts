import * as THREE from 'three';
import { ROAD, type Track, type TrackSample } from './Track';

export interface CarControls {
  throttle: number;
  steer: number;
}

export const CAR_TUNING = {
  maxSpeed: 30, // m/s (108 km/h)
  maxReverse: 8,
  accel: 13,
  brake: 32,
  coastDrag: 3,
  lateralSpeed: 10,
  lateralResponse: 9,
  edgeMargin: 1.2,
};

/**
 * Arcade car that rides along the track spline: `s` is distance along the road,
 * `offset` is lateral distance from the centerline (positive = right).
 */
export class Car {
  readonly object = new THREE.Group();
  s = 0;
  offset = 0;
  speed = 0;
  lateralVelocity = 0;
  maxSpeed = CAR_TUNING.maxSpeed;
  /** Seconds of "stunned" time after bouncing off a barrier (input ignored). */
  stunned = 0;

  private body = new THREE.Group();
  private wheels: THREE.Mesh[] = [];
  private frontWheelPivots: THREE.Group[] = [];
  private sample: TrackSample = {
    position: new THREE.Vector3(),
    tangent: new THREE.Vector3(),
    right: new THREE.Vector3(),
    heading: 0,
  };
  private yawOffset = 0;
  private camPos = new THREE.Vector3();
  private camLook = new THREE.Vector3();
  private camInit = false;

  constructor() {
    this.buildMesh();
    this.object.add(this.body);
  }

  private buildMesh() {
    const paint = new THREE.MeshStandardMaterial({ color: '#e6452e', metalness: 0.4, roughness: 0.35 });
    const dark = new THREE.MeshStandardMaterial({ color: '#1d2129', roughness: 0.6 });
    const glass = new THREE.MeshStandardMaterial({ color: '#8fb6d9', metalness: 0.2, roughness: 0.1 });
    const head = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff4c2', emissiveIntensity: 2 });
    const tail = new THREE.MeshStandardMaterial({ color: '#ff3040', emissive: '#ff2030', emissiveIntensity: 1.5 });

    // The car is modeled facing -Z (forward), +X is its right side.
    const lower = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 4.2), paint);
    lower.position.y = 0.65;
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.55, 2.1), glass);
    cabin.position.set(0, 1.22, 0.25);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.62, 0.1, 1.8), paint);
    roof.position.set(0, 1.52, 0.3);
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.08, 0.4), dark);
    spoiler.position.set(0, 1.2, 2.0);
    const bumper = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.25, 0.2), dark);
    bumper.position.set(0, 0.45, -2.12);
    this.body.add(lower, cabin, roof, spoiler, bumper);
    for (const x of [-0.65, 0.65]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.16, 0.05), head);
      h.position.set(x, 0.75, -2.11);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.14, 0.05), tail);
      t.position.set(x, 0.78, 2.11);
      this.body.add(h, t);
    }

    const wheelGeo = new THREE.CylinderGeometry(0.38, 0.38, 0.3, 14).rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: '#15171b', roughness: 0.9 });
    for (const [x, z, front] of [
      [-0.95, -1.35, true],
      [0.95, -1.35, true],
      [-0.95, 1.35, false],
      [0.95, 1.35, false],
    ] as const) {
      const wheel = new THREE.Mesh(wheelGeo, wheelMat);
      const pivot = new THREE.Group();
      pivot.position.set(x, 0.38, z);
      pivot.add(wheel);
      this.object.add(pivot);
      this.wheels.push(wheel);
      if (front) this.frontWheelPivots.push(pivot);
    }
  }

  reset(s: number, offset = 0) {
    this.s = s;
    this.offset = offset;
    this.speed = 0;
    this.lateralVelocity = 0;
    this.stunned = 0;
    this.camInit = false;
  }

  /** Knocks the car back to `s` with a backwards velocity (barrier hit). */
  bounce(s: number, backSpeed = 12, stun = 0.9) {
    this.s = s;
    this.speed = -backSpeed;
    this.lateralVelocity = 0;
    this.stunned = stun;
  }

  update(dt: number, controls: CarControls, track: Track) {
    const T = CAR_TUNING;
    let throttle = controls.throttle;
    let steer = controls.steer;
    if (this.stunned > 0) {
      this.stunned -= dt;
      throttle = 0;
      steer = 0;
      // Strong drag so the bounce stops quickly.
      this.speed += Math.sign(-this.speed) * Math.min(Math.abs(this.speed), 16 * dt);
    }

    if (throttle > 0) {
      if (this.speed < 0) this.speed = Math.min(0, this.speed + T.brake * dt);
      else {
        const accel = T.accel * (this.maxSpeed / T.maxSpeed) * (1 - (0.5 * this.speed) / this.maxSpeed);
        this.speed = Math.min(this.maxSpeed, this.speed + accel * throttle * dt);
      }
    } else if (throttle < 0) {
      if (this.speed > 0) this.speed = Math.max(0, this.speed - T.brake * dt);
      else this.speed = Math.max(-T.maxReverse, this.speed - T.accel * 0.6 * dt);
    } else if (this.stunned <= 0) {
      const drag = T.coastDrag * dt;
      this.speed = Math.abs(this.speed) <= drag ? 0 : this.speed - Math.sign(this.speed) * drag;
    }
    if (this.speed > this.maxSpeed) this.speed = Math.max(this.maxSpeed, this.speed - T.brake * dt);

    const speedFactor = Math.min(1, 0.35 + Math.abs(this.speed) / 14);
    const targetLat = steer * T.lateralSpeed * speedFactor;
    this.lateralVelocity += (targetLat - this.lateralVelocity) * Math.min(1, T.lateralResponse * dt);
    this.offset += this.lateralVelocity * dt;
    const limit = ROAD.halfWidth - T.edgeMargin;
    if (Math.abs(this.offset) > limit) {
      this.offset = Math.sign(this.offset) * limit;
      this.lateralVelocity = 0;
    }

    this.s += this.speed * dt;
    this.s = Math.max(this.s, track.startS + 3);

    const smp = track.sampleAt(this.s, this.sample);
    this.object.position.copy(smp.position).addScaledVector(smp.right, this.offset);
    const targetYaw = Math.atan2(this.lateralVelocity, Math.max(Math.abs(this.speed), 4)) * Math.sign(this.speed || 1);
    this.yawOffset += (targetYaw - this.yawOffset) * Math.min(1, 10 * dt);
    this.object.rotation.y = -(smp.heading + this.yawOffset) - Math.PI / 2;

    // Visual flourishes: body roll, wheel spin, front wheel steer.
    this.body.rotation.z = THREE.MathUtils.lerp(this.body.rotation.z, -this.lateralVelocity * 0.012, 0.2);
    for (const w of this.wheels) w.rotation.x -= (this.speed * dt) / 0.38;
    for (const p of this.frontWheelPivots) p.rotation.y = -steer * 0.35;
  }

  get position(): THREE.Vector3 {
    return this.object.position;
  }

  get heading(): number {
    return this.sample.heading;
  }

  /** Unit road direction at the car (world space). */
  get forward(): THREE.Vector3 {
    return this.sample.tangent;
  }

  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  /** Smoothed chase camera behind the car, aligned with the road direction. */
  updateCamera(camera: THREE.PerspectiveCamera, dt: number) {
    const tan = this.sample.tangent;
    const desired = new THREE.Vector3()
      .copy(this.object.position)
      .addScaledVector(tan, -9.5)
      .addScaledVector(this.sample.right, -this.offset * 0.35);
    desired.y = 4.3;
    const look = new THREE.Vector3().copy(this.object.position).addScaledVector(tan, 10);
    look.y = 2.2;
    if (!this.camInit) {
      this.camPos.copy(desired);
      this.camLook.copy(look);
      this.camInit = true;
    }
    const k = 1 - Math.exp(-dt * 6);
    this.camPos.lerp(desired, k);
    this.camLook.lerp(look, 1 - Math.exp(-dt * 10));
    camera.position.copy(this.camPos);
    camera.lookAt(this.camLook);
  }
}
