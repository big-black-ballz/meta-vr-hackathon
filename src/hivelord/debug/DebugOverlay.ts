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
import type { GestureDetector } from '../input/GestureDetector.js';
import type { HandState } from '../input/HandState.js';
import { GESTURE_LABELS } from '../input/GestureMap.js';
import { getGestureDetector } from '../input/InputSystem.js';

const PANEL_WIDTH = 0.4;
const PANEL_HEIGHT = 0.3;
const CANVAS_WIDTH = 640;
const CANVAS_HEIGHT = 480;

/**
 * Camera-relative debug panel. Redraws at most 4x/sec and uses one draw call.
 * Hidden entirely when DEBUG is false or the config flag is off.
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
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;
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
      .addScaledVector(this.right, -0.06)
      .addScaledVector(this.forward, 0.8)
      .addScaledVector(this.up, -0.22);
    this.panel.quaternion.copy(this.quaternion);
  }

  private draw(): void {
    const ctx = this.ctx;
    const texture = this.texture;
    if (ctx == null || texture == null) {
      return;
    }
    const detector = getGestureDetector();
    const state = gameState.getState();
    const immersive =
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    const leftTracked = detector?.left.tracked ?? false;
    const rightTracked = detector?.right.tracked ?? false;
    const bothLost = immersive && !leftTracked && !rightTracked;
    const planeCount = this.queries.planes.entities.size;
    const mode = immersive
      ? planeCount > 0
        ? `AR (${planeCount} planes)`
        : 'AR (fallback)'
      : 'Browser';

    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
    ctx.fillStyle = 'rgba(7, 14, 26, 0.9)';
    this.roundRect(ctx, 8, 8, 624, 464, 18);
    ctx.fill();
    ctx.strokeStyle = 'rgba(111, 230, 255, 0.5)';
    ctx.lineWidth = 2;
    this.roundRect(ctx, 8, 8, 624, 464, 18);
    ctx.stroke();

    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(235, 250, 255, 0.98)';
    ctx.font = '700 24px system-ui, sans-serif';
    ctx.fillText('HIVELORD  L1', 28, 36);
    ctx.fillStyle = 'rgba(111, 230, 255, 0.9)';
    ctx.font = '600 16px system-ui, sans-serif';
    ctx.fillText(`${this.fps.toFixed(0)} FPS  ${this.frameMs.toFixed(1)} ms`, 420, 36);

    ctx.font = '500 15px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(160, 196, 216, 0.9)';
    ctx.fillText(
      `${state}   scale ${timeControl.timeScale.toFixed(2)}   dt ${(
        timeControl.deltaTime * 1000
      ).toFixed(1)} ms   bots 0`,
      28,
      62,
    );
    ctx.fillStyle = 'rgba(235, 250, 255, 0.9)';
    ctx.fillText(mode, 420, 62);

    if (bothLost) {
      ctx.fillStyle = 'rgba(255, 92, 92, 0.92)';
      ctx.font = '700 16px system-ui, sans-serif';
      ctx.fillText('HANDS LOST', 28, 84);
    } else {
      const dominant = detector?.getDominantHand() ?? null;
      ctx.fillStyle = 'rgba(150, 170, 190, 0.8)';
      ctx.font = '500 14px system-ui, sans-serif';
      ctx.fillText(
        `dominant ${dominant ?? 'auto'}   gesture key path: detection + debounce`,
        28,
        84,
      );
    }

    this.drawHand(ctx, 28, 110, 'L', detector?.left, leftTracked, detector);
    this.drawHand(ctx, 330, 110, 'R', detector?.right, rightTracked, detector);

    ctx.fillStyle = 'rgba(111, 230, 255, 0.85)';
    ctx.font = '700 14px system-ui, sans-serif';
    ctx.fillText('LAST GESTURE EVENTS', 28, 286);
    ctx.font = '500 13px system-ui, sans-serif';
    const log = detector?.getEventLog();
    if (log == null || log.length === 0) {
      ctx.fillStyle = 'rgba(150, 170, 190, 0.7)';
      ctx.fillText('no events yet', 28, 310);
    } else {
      ctx.fillStyle = 'rgba(220, 240, 250, 0.9)';
      for (let i = 0; i < log.length; i++) {
        ctx.fillText(log[i], 28, 310 + i * 21);
      }
    }

    ctx.fillStyle = 'rgba(150, 170, 190, 0.7)';
    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillText(
      '1 pinch  2 fist  3 flat palm  4 cupped  5 open palm  6 stop',
      28,
      428,
    );
    ctx.fillText(
      '1-6 right hand   Shift+1-6 left hand   H hide   P pause',
      28,
      450,
    );
    texture.needsUpdate = true;
  }

  private drawHand(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    tag: string,
    hand: HandState | undefined,
    tracked: boolean,
    detector: GestureDetector | undefined,
  ): void {
    ctx.textAlign = 'left';
    ctx.font = '700 15px system-ui, sans-serif';
    ctx.fillStyle = tracked
      ? 'rgba(111, 230, 255, 0.95)'
      : 'rgba(255, 150, 120, 0.9)';
    const primary = hand == null ? null : detector?.getPrimaryGesture(hand.hand);
    const hold = primary == null ? 0 : detector?.getHoldSeconds(primary, hand?.hand);
    const gestureLabel =
      primary == null ? 'none' : GESTURE_LABELS[primary].toUpperCase();
    ctx.fillText(
      `${tag}  ${tracked ? 'TRACKED' : 'OFF'}   ${gestureLabel}${
        primary != null ? ` ${(hold ?? 0).toFixed(1)}s` : ''
      }`,
      x,
      y,
    );

    if (hand == null) {
      ctx.font = '500 13px system-ui, sans-serif';
      ctx.fillStyle = 'rgba(150, 170, 190, 0.7)';
      ctx.fillText('no hand data', x, y + 22);
      return;
    }

    ctx.font = '500 13px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(220, 240, 250, 0.85)';
    ctx.fillText(
      `pinch ${(hand.pinchDistance * 1000).toFixed(1)} mm   spread ${hand.spreadRatio.toFixed(2)}`,
      x,
      y + 22,
    );
    ctx.fillText(
      `curl ${hand.curl[0].toFixed(2)} ${hand.curl[1].toFixed(2)} ${hand.curl[2].toFixed(2)} ${hand.curl[3].toFixed(2)} ${hand.curl[4].toFixed(2)}`,
      x,
      y + 42,
    );
    ctx.fillText(
      `bend ${hand.bend[0].toFixed(2)} ${hand.bend[1].toFixed(2)} ${hand.bend[2].toFixed(2)} ${hand.bend[3].toFixed(2)} ${hand.bend[4].toFixed(2)}`,
      x,
      y + 62,
    );
    ctx.fillText(
      `normal up ${hand.palmUpDot.toFixed(2)}   fwd ${hand.palmForwardDot.toFixed(2)}`,
      x,
      y + 82,
    );
    ctx.fillStyle = 'rgba(150, 170, 190, 0.8)';
    ctx.font = '500 12px system-ui, sans-serif';
    ctx.fillText(
      `state ${detector?.getGestureState(primary ?? 'pinch', hand.hand) ?? 'None'}`,
      x,
      y + 102,
    );
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
