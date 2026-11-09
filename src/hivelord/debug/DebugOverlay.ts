import {
  CanvasTexture,
  createSystem,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  SRGBColorSpace,
  Vector3,
  VisibilityState,
  XRPlane,
} from '@iwsdk/core';
import {
  DEBUG,
  DEBUG_OVERLAY_ENABLED,
  DEBUG_OVERLAY_KEY,
  DEBUG_OVERLAY_UPDATE_HZ,
} from '../core/config.js';
import { gameState } from '../core/GameState.js';
import { timeControl } from '../core/TimeControl.js';

const PANEL_WIDTH = 0.24;
const PANEL_HEIGHT = 0.15;

/**
 * Small camera-relative text panel. Redraws at most 4x/sec and uses one draw
 * call. Hidden entirely when DEBUG is false or the config flag is off.
 */
export class DebugOverlaySystem extends createSystem({
  planes: { required: [XRPlane] },
}) {
  private panel: Mesh | undefined;
  private canvas: HTMLCanvasElement | undefined;
  private ctx: CanvasRenderingContext2D | undefined;
  private texture: CanvasTexture | undefined;
  private visible = DEBUG && DEBUG_OVERLAY_ENABLED;
  private drawAccumulator = 0;
  private fpsAccumulator = 0;
  private fpsFrames = 0;
  private fps = 0;
  private frameMs = 0;

  private head = new Vector3();
  private right = new Vector3();
  private up = new Vector3();
  private forward = new Vector3();
  private quaternion = new Quaternion();

  init(): void {
    if (!DEBUG || !DEBUG_OVERLAY_ENABLED) {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 320;
    const ctx = canvas.getContext('2d');
    if (ctx == null) {
      return;
    }
    this.canvas = canvas;
    this.ctx = ctx;
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.texture = texture;
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(new PlaneGeometry(PANEL_WIDTH, PANEL_HEIGHT), material);
    mesh.name = 'hivelord-debug-overlay';
    mesh.visible = this.visible;
    const entity = this.world.createTransformEntity(mesh);
    if (entity.object3D == null) {
      return;
    }
    this.panel = mesh;
    this.draw();
  }

  update(delta: number): void {
    if (!DEBUG || this.panel == null) {
      return;
    }

    this.fpsAccumulator += delta;
    this.fpsFrames++;
    if (this.fpsAccumulator >= 0.25) {
      this.frameMs = (this.fpsAccumulator / this.fpsFrames) * 1000;
      this.fps = this.frameMs > 0 ? 1000 / this.frameMs : 0;
      this.fpsAccumulator = 0;
      this.fpsFrames = 0;
    }

    if (this.input.keyboard?.getKeyDown(DEBUG_OVERLAY_KEY) === true) {
      this.visible = !this.visible;
      this.panel.visible = this.visible;
    }

    if (!this.visible) {
      return;
    }

    this.updatePose();
    this.drawAccumulator += delta;
    if (this.drawAccumulator >= 1 / DEBUG_OVERLAY_UPDATE_HZ) {
      this.drawAccumulator = 0;
      this.draw();
    }
  }

  private updatePose(): void {
    if (this.panel == null) {
      return;
    }
    const camera = this.world.camera;
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.head);
    camera.getWorldQuaternion(this.quaternion);
    this.right.set(1, 0, 0).applyQuaternion(this.quaternion);
    this.up.set(0, 1, 0).applyQuaternion(this.quaternion);
    this.forward.set(0, 0, -1).applyQuaternion(this.quaternion);
    this.panel.position
      .copy(this.head)
      .addScaledVector(this.right, -0.12)
      .addScaledVector(this.forward, 0.65)
      .addScaledVector(this.up, -0.1);
    this.panel.quaternion.copy(this.quaternion);
  }

  private draw(): void {
    const ctx = this.ctx;
    const texture = this.texture;
    if (ctx == null || texture == null) {
      return;
    }
    const state = gameState.getState();
    const immersive =
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    let left = false;
    let right = false;
    if (immersive) {
      try {
        left = this.input.xr.isPrimary('hand', 'left') === true;
        right = this.input.xr.isPrimary('hand', 'right') === true;
      } catch {
        left = false;
        right = false;
      }
    }
    const planeCount = this.queries.planes.entities.size;
    const mode = immersive
      ? planeCount > 0
        ? `AR (${planeCount} planes)`
        : 'AR (fallback)'
      : 'Browser';

    ctx.clearRect(0, 0, 512, 320);
    ctx.fillStyle = 'rgba(7, 14, 26, 0.88)';
    this.roundRect(ctx, 8, 8, 496, 304, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(111, 230, 255, 0.5)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 8, 8, 496, 304, 18);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(235, 250, 255, 0.98)';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText('HIVELORD  L0', 28, 38);
    ctx.fillStyle = 'rgba(111, 230, 255, 0.9)';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText(`${this.fps.toFixed(0)} FPS   ${this.frameMs.toFixed(1)} ms`, 300, 38);

    const rows: Array<[string, string]> = [
      ['state', state],
      ['time scale', timeControl.timeScale.toFixed(2)],
      ['game dt', `${(timeControl.deltaTime * 1000).toFixed(1)} ms`],
      ['bots', '0'],
      ['gesture', 'none'],
      ['hands', `L ${left ? 'tracked' : 'off'}   R ${right ? 'tracked' : 'off'}`],
      ['session', mode],
    ];
    ctx.font = '500 18px system-ui, sans-serif';
    let y = 82;
    for (const [label, value] of rows) {
      ctx.fillStyle = 'rgba(160, 196, 216, 0.9)';
      ctx.fillText(label, 28, y);
      ctx.fillStyle = 'rgba(235, 250, 255, 0.98)';
      ctx.fillText(value, 160, y);
      y += 28;
    }

    ctx.fillStyle = 'rgba(150, 170, 190, 0.65)';
    ctx.font = '400 14px system-ui, sans-serif';
    ctx.fillText('H hide   P pause', 28, 292);
    texture.needsUpdate = true;
  }

  private roundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + w - radius, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
    ctx.lineTo(x + w, y + h - radius);
    ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
    ctx.lineTo(x + radius, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }
}
