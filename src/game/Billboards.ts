import * as THREE from 'three';
import { CJK_FONT } from './textTexture';

const ART = ['billboards/billboard-hug-1.png', 'billboards/billboard-hug-2.png', 'billboards/billboard-hug-3.png'];
const BANNER_COLORS: Array<[string, string]> = [
  ['#d7263d', '#ff6b6b'],
  ['#e07a1f', '#ffb347'],
  ['#2a6fdb', '#5fb4ff'],
];
const W = 1024;
const H = 1024;
const ART_H = 768;
/** Billboard height / width, matching the canvas. */
export const BILLBOARD_ASPECT = H / W;

function heart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s * 0.5, y, x - s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x - s * 0.5, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s * 0.3);
  ctx.bezierCurveTo(x + s * 0.5, y, x, y, x, y + s * 0.3);
  ctx.fill();
}

/** Draws the art (or a sky placeholder while it loads) plus the "Jesus Loves You" banner. */
function drawBillboard(canvas: HTMLCanvasElement, img: HTMLImageElement | null, variant: number) {
  const ctx = canvas.getContext('2d')!;
  if (img) {
    ctx.drawImage(img, 0, 0, W, ART_H);
  } else {
    const g = ctx.createLinearGradient(0, 0, 0, ART_H);
    g.addColorStop(0, '#7cc4ff');
    g.addColorStop(1, '#d9f0ff');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, ART_H);
  }

  const [c0, c1] = BANNER_COLORS[variant % BANNER_COLORS.length];
  const g = ctx.createLinearGradient(0, ART_H, 0, H);
  g.addColorStop(0, c1);
  g.addColorStop(1, c0);
  ctx.fillStyle = g;
  ctx.fillRect(0, ART_H, W, H - ART_H);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(0, ART_H, W, 8);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.font = `900 118px ${CJK_FONT}`;
  ctx.lineWidth = 14;
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.strokeText('耶穌愛你', W / 2, ART_H + 88);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('耶穌愛你', W / 2, ART_H + 88);
  ctx.font = `800 64px "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
  ctx.fillStyle = '#fff6d6';
  ctx.fillText('Jesus Loves You', W / 2, ART_H + 196);

  ctx.fillStyle = '#ffffff';
  for (const x of [120, W - 120]) heart(ctx, x, ART_H + 70, 90);
}

/**
 * Framed "Jesus Loves You" billboards with cartoon art, mounted on building fronts.
 * Textures are shared; `create` returns a group positioned on a facade.
 */
export class Billboards {
  private materials: THREE.MeshBasicMaterial[] = [];
  private plane = new THREE.PlaneGeometry(1, 1);
  private box = new THREE.BoxGeometry(1, 1, 1);
  private frameMat = new THREE.MeshStandardMaterial({ color: '#f5f1e6', metalness: 0.3, roughness: 0.5 });
  private lampMat = new THREE.MeshStandardMaterial({ color: '#fffbe8', emissive: '#fff1b0', emissiveIntensity: 2.5 });
  private armMat = new THREE.MeshStandardMaterial({ color: '#3a3f47', metalness: 0.6, roughness: 0.5 });
  private glowMat = new THREE.MeshBasicMaterial({
    color: '#fff3c0',
    transparent: true,
    opacity: 0.12,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  private next = 0;

  constructor() {
    ART.forEach((src, i) => {
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      drawBillboard(canvas, null, i);
      const tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      this.materials.push(new THREE.MeshBasicMaterial({ map: tex, color: '#f2f2f2', toneMapped: false }));
      const img = new Image();
      img.onload = () => {
        drawBillboard(canvas, img, i);
        tex.needsUpdate = true;
      };
      img.src = import.meta.env.BASE_URL + src;
    });
  }

  /**
   * A billboard of `width` meters whose face center is at `center`, facing world direction `yaw`
   * (rotation around Y applied to +Z), standing on two posts `postHeight` meters tall.
   */
  create(center: THREE.Vector3, yaw: number, width: number, postHeight = 0): THREE.Group {
    const h = width * BILLBOARD_ASPECT;
    const g = new THREE.Group();
    g.position.copy(center);
    g.rotation.y = yaw;

    if (postHeight > 0) {
      for (const x of [-width * 0.32, width * 0.32]) {
        const post = new THREE.Mesh(this.box, this.armMat);
        post.scale.set(0.35, postHeight + 0.5, 0.35);
        post.position.set(x, -h / 2 - postHeight / 2, -0.4);
        g.add(post);
      }
      const brace = new THREE.Mesh(this.box, this.armMat);
      brace.scale.set(width * 0.7, 0.2, 0.2);
      brace.position.set(0, -h / 2 - postHeight * 0.5, -0.4);
      g.add(brace);
    }

    const frame = new THREE.Mesh(this.box, this.frameMat);
    frame.scale.set(width + 0.5, h + 0.5, 0.3);
    frame.position.z = -0.1;
    const face = new THREE.Mesh(this.plane, this.materials[this.next++ % this.materials.length]);
    face.scale.set(width, h, 1);
    face.position.z = 0.06;
    g.add(frame, face);

    // Spotlights on arms above the sign, with a faint cone of light.
    for (const x of [-width * 0.3, width * 0.3]) {
      const arm = new THREE.Mesh(this.box, this.armMat);
      arm.scale.set(0.12, 0.12, 1.4);
      arm.position.set(x, h / 2 + 0.4, 0.6);
      const lamp = new THREE.Mesh(this.box, this.lampMat);
      lamp.scale.set(0.6, 0.2, 0.35);
      lamp.position.set(x, h / 2 + 0.35, 1.3);
      const glow = new THREE.Mesh(this.plane, this.glowMat);
      glow.scale.set(width * 0.45, h * 0.9, 1);
      glow.position.set(x, h * 0.05, 0.3);
      g.add(arm, lamp, glow);
    }
    return g;
  }
}
