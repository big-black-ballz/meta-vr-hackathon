import {
  AdditiveBlending,
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
} from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { THEME, withAlpha } from '../theme.js';
import type { Control } from '../controls.js';
import { UI_PPM } from '../screen.js';
import {
  drawCrown,
  drawHex,
  drawPause,
  drawWarnTriangle,
} from './icons.js';

const sharedGeometry = new PlaneGeometry(1, 1);
const FORWARD = new Vector3(0, 0, 1);
const tmpNormal = new Vector3();
const tmpLocal = new Vector3();

function makeCanvas(w: number, h: number): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} | null {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  return ctx == null ? null : { canvas, ctx };
}

/**
 * Dark shadow plate behind the focused panel. One shared mesh/material and a
 * cached 128 px soft-edge texture, so the whole UI adds one draw call.
 */
export class ShadowPlate {
  readonly mesh: Mesh;

  constructor(world: World) {
    const made = makeCanvas(128, 128);
    if (made == null) {
      throw new Error('[Hivelord] canvas unavailable for shadow plate');
    }
    const { canvas, ctx } = made;
    ctx.filter = 'blur(7px)';
    ctx.fillStyle = withAlpha(THEME.base, 0.65);
    ctx.beginPath();
    ctx.roundRect(14, 14, 100, 100, 24);
    ctx.fill();
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new Mesh(sharedGeometry, material);
    this.mesh.name = 'hivelord-ui-shadow';
    this.mesh.visible = false;
    this.mesh.renderOrder = 1;
    world.createTransformEntity(this.mesh);
  }

  setPose(
    position: Vector3,
    quaternion: Quaternion,
    widthM: number,
    heightM: number,
  ): void {
    tmpNormal.copy(FORWARD).applyQuaternion(quaternion);
    this.mesh.position.copy(position).addScaledVector(tmpNormal, -0.003);
    this.mesh.quaternion.copy(quaternion);
    this.mesh.scale.set(widthM + 0.06, heightM + 0.06, 1);
    this.mesh.visible = true;
  }

  hide(): void {
    this.mesh.visible = false;
  }
}

export type OrnamentKind = 'crest' | 'crown' | 'pause' | 'warning' | 'hex';

/**
 * Raised title ornament (crest/icon) sitting 2.5 mm in front of the panel for
 * real headset parallax. One shared mesh, 192 px cached texture, redrawn only
 * when the focused screen changes.
 */
export class OrnamentPlate {
  readonly mesh: Mesh;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly texture: CanvasTexture;
  private kind: OrnamentKind | null = null;

  constructor(world: World) {
    const made = makeCanvas(192, 192);
    if (made == null) {
      throw new Error('[Hivelord] canvas unavailable for ornament plate');
    }
    this.canvas = made.canvas;
    this.ctx = made.ctx;
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.mesh = new Mesh(sharedGeometry, material);
    this.mesh.name = 'hivelord-ui-ornament';
    this.mesh.visible = false;
    this.mesh.renderOrder = 12;
    world.createTransformEntity(this.mesh);
  }

  setKind(kind: OrnamentKind): void {
    if (this.kind === kind) {
      return;
    }
    this.kind = kind;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, 192, 192);
    const cx = 96;
    const cy = 96;
    drawHex(ctx, cx, cy, 74, withAlpha(THEME.primary, 0.5), withAlpha(THEME.base, 0.5), 3);
    drawHex(ctx, cx, cy, 62, withAlpha(THEME.primary, 0.25), null, 1);
    if (kind === 'crest') {
      const ring = [
        [0, 0],
        [-0.9, -0.5], [0.9, -0.5], [-0.9, 0.5], [0.9, 0.5],
        [-1.8, 0], [1.8, 0],
      ];
      for (let i = 0; i < 7; i++) {
        const [dx, dy] = ring[i] ?? [0, 0];
        drawHex(
          ctx,
          cx + dx * 26,
          cy + dy * 26,
          18,
          withAlpha(THEME.primary, i === 0 ? 1 : 0.55),
          i === 0 ? withAlpha(THEME.primary, 0.18) : null,
          i === 0 ? 3 : 1.5,
        );
      }
    } else if (kind === 'crown') {
      drawCrown(ctx, cx, cy, 86, THEME.primary);
    } else if (kind === 'pause') {
      drawPause(ctx, cx, cy, 78, THEME.textMuted);
    } else if (kind === 'warning') {
      drawWarnTriangle(ctx, cx, cy, 74, THEME.warning);
    } else {
      drawHex(ctx, cx, cy, 26, THEME.primary, null, 3);
    }
    this.texture.needsUpdate = true;
  }

  setPose(
    position: Vector3,
    quaternion: Quaternion,
    panelWidthM: number,
    panelHeightM: number,
    centerTop = false,
  ): void {
    if (this.kind == null) {
      return;
    }
    tmpLocal
      .set(
        centerTop ? 0 : -panelWidthM / 2 + 0.085,
        panelHeightM / 2 - (centerTop ? 0.02 : 0.075),
        0.0025,
      )
      .applyQuaternion(quaternion);
    this.mesh.position.copy(position).add(tmpLocal);
    this.mesh.quaternion.copy(quaternion);
    const size = centerTop ? 0.075 : 0.13;
    this.mesh.scale.set(size, size, 1);
    this.mesh.visible = true;
  }

  setOpacity(opacity: number): void {
    const material = this.mesh.material as MeshBasicMaterial;
    material.opacity = Math.max(0, Math.min(1, opacity));
  }

  hide(): void {
    this.mesh.visible = false;
  }
}

/**
 * Single reusable hover light sweep. A cached diagonal gradient is moved with
 * texture.offset, so the animation costs a uniform update rather than a panel
 * redraw. Only visible while a control is hovered.
 */
export class HoverSweep {
  readonly mesh: Mesh;
  private readonly texture: CanvasTexture;
  private readonly material: MeshBasicMaterial;
  private t = 0;

  constructor(world: World) {
    const made = makeCanvas(128, 64);
    if (made == null) {
      throw new Error('[Hivelord] canvas unavailable for hover sweep');
    }
    const { canvas, ctx } = made;
    const gradient = ctx.createLinearGradient(0, 0, 128, 64);
    gradient.addColorStop(0, withAlpha(THEME.text, 0));
    gradient.addColorStop(0.45, withAlpha(THEME.text, 0.32));
    gradient.addColorStop(0.55, withAlpha(THEME.primary, 0.4));
    gradient.addColorStop(1, withAlpha(THEME.text, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 64);
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
      blending: AdditiveBlending,
    });
    this.mesh = new Mesh(sharedGeometry, this.material);
    this.mesh.name = 'hivelord-ui-hover-sweep';
    this.mesh.visible = false;
    this.mesh.renderOrder = 13;
    world.createTransformEntity(this.mesh);
  }

  start(panel: Mesh, control: Control, panelWidthPx: number, panelHeightPx: number): void {
    const localX = (control.x + control.w / 2 - panelWidthPx / 2) / UI_PPM;
    const localY = (panelHeightPx / 2 - (control.y + control.h / 2)) / UI_PPM;
    panel.updateWorldMatrix(true, false);
    tmpLocal.set(localX, localY, 0.006).applyMatrix4(panel.matrixWorld);
    this.mesh.position.copy(tmpLocal);
    panel.getWorldQuaternion(this.mesh.quaternion);
    this.mesh.scale.set(
      Math.max(0.02, (control.w - 16) / UI_PPM),
      Math.max(0.02, (control.h - 12) / UI_PPM),
      1,
    );
    this.t = 0;
    this.texture.offset.x = -0.7;
    this.material.opacity = 0;
    this.mesh.visible = true;
  }

  update(dt: number): void {
    if (!this.mesh.visible) {
      return;
    }
    this.t = Math.min(1, this.t + dt / 0.45);
    this.texture.offset.x = -0.7 + this.t * 1.9;
    this.material.opacity = Math.sin(Math.PI * this.t) * 0.9;
    if (this.t >= 1) {
      this.mesh.visible = false;
    }
  }

  hide(): void {
    this.mesh.visible = false;
  }
}
