/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

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
import { THEME, withAlpha } from './hivelord/ui/theme.js';

const SCAN_SECONDS = 12;
const PANEL_HOLD_SECONDS = 2.5;

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Guides the user through a room scan. It opens the platform room-capture flow
 * when available, shows instructions and a progress bar, and reports detected
 * XRPlane surfaces while SceneUnderstandingSystem fills them in.
 */
export class RoomScanSystem extends createSystem({
  planes: { required: [XRPlane] },
}) {
  private panel: Mesh | undefined;
  private canvas: HTMLCanvasElement | undefined;
  private ctx: CanvasRenderingContext2D | undefined;
  private texture: CanvasTexture | undefined;
  private active = false;
  private started = false;
  private finished = false;
  private elapsed = 0;
  private holdTime = 0;
  private logTimer = 0;
  private captureRequested = false;
  private lastPlaneLog = '';

  private tmpHead = new Vector3();
  private tmpQuat = new Quaternion();
  private tmpForward = new Vector3();

  init(): void {
    this.buildPanel();
    this.cleanupFuncs.push(() => {
      this.texture?.dispose();
      this.panel?.geometry.dispose();
    });
  }

  update(delta: number): void {
    const immersive =
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!immersive) {
      if (this.active || this.finished) {
        this.hidePanel();
        this.active = false;
        this.finished = false;
        this.started = false;
        this.elapsed = 0;
        this.holdTime = 0;
        this.captureRequested = false;
      }
      return;
    }

    if (
      this.input.keyboard?.getKeyDown('KeyS') === true &&
      !this.active
    ) {
      this.startScan();
    }

    if (!this.started) {
      this.startScan();
    }
    if (!this.active) {
      return;
    }

    this.elapsed += delta;
    this.updatePanel();
    this.updatePanelPose();
    this.logPlaneState(delta);

    if (!this.finished && this.elapsed >= SCAN_SECONDS) {
      this.finished = true;
      this.holdTime = 0;
      this.updatePanel();
      console.info(
        `[RoomScan] finished with ${this.planeCount()} detected surface(s)`,
      );
    }
    if (this.finished) {
      this.holdTime += delta;
      if (this.holdTime > PANEL_HOLD_SECONDS) {
        this.hidePanel();
        this.active = false;
      }
    }
  }

  private startScan(): void {
    this.active = true;
    this.started = true;
    this.finished = false;
    this.elapsed = 0;
    this.holdTime = 0;
    this.lastPlaneLog = '';
    if (!this.captureRequested) {
      this.captureRequested = true;
      const manager = (
        this as unknown as {
          xrManager?: { getSession?: () => XRSession | null };
        }
      ).xrManager;
      const session = manager?.getSession?.();
      const capture = session as unknown as {
        initiateRoomCapture?: () => Promise<void>;
      };
      if (typeof capture?.initiateRoomCapture === 'function') {
        try {
          const request = capture.initiateRoomCapture();
          if (request != null && typeof request.catch === 'function') {
            request.catch((error: unknown) => {
              console.warn('[RoomScan] room capture was not available', error);
            });
          }
        } catch (error) {
          console.warn('[RoomScan] room capture was not available', error);
        }
      }
    }
    this.updatePanel();
    this.updatePanelPose();
    if (this.panel != null) {
      this.panel.visible = true;
    }
  }

  private hidePanel(): void {
    if (this.panel != null) {
      this.panel.visible = false;
    }
  }

  private buildPanel(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
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
      toneMapped: false,
    });
    const mesh = new Mesh(new PlaneGeometry(0.95, 0.48), material);
    mesh.name = 'room-scan-panel';
    mesh.visible = false;
    const entity = this.world.createTransformEntity(mesh);
    if (entity.object3D == null) {
      return;
    }
    this.panel = mesh;
  }

  private updatePanel(): void {
    const ctx = this.ctx;
    const texture = this.texture;
    if (ctx == null || texture == null) {
      return;
    }
    const progress = this.finished
      ? 1
      : clamp(this.elapsed / SCAN_SECONDS, 0, 1);
    const count = this.planeCount();
    const instruction = this.finished
      ? count > 0
        ? 'Room scan complete'
        : 'No surfaces detected - using virtual surfaces'
      : progress < 0.34
        ? 'Slowly look at the floor.'
        : progress < 0.68
          ? 'Now look at walls, bed, table and couch.'
          : 'Keep moving your head to fill gaps.';
    const status =
      count > 0
        ? `${count} surface${count === 1 ? '' : 's'} detected`
        : this.elapsed > 4
          ? 'Nothing yet. If needed, run Space Setup in Quest Settings > Boundary.'
          : 'Looking for surfaces...';

    ctx.clearRect(0, 0, 640, 320);
    ctx.fillStyle = withAlpha(THEME.panel, THEME.panelOpacity);
    this.roundRect(ctx, 12, 12, 616, 296, 28);
    ctx.fill();
    ctx.strokeStyle = withAlpha(THEME.primary, 0.5);
    ctx.lineWidth = 2;
    this.roundRect(ctx, 12, 12, 616, 296, 28);
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.text;
    ctx.font = '600 32px system-ui, sans-serif';
    ctx.fillText('Scanning your room', 320, 62);

    ctx.fillStyle = THEME.textMuted;
    ctx.font = '500 20px system-ui, sans-serif';
    ctx.fillText(instruction, 320, 112);

    ctx.fillStyle = THEME.panelEdge;
    this.roundRect(ctx, 64, 158, 512, 34, 17);
    ctx.fill();
    ctx.fillStyle = THEME.primary;
    this.roundRect(ctx, 64, 158, 512 * progress, 34, 17);
    ctx.fill();

    ctx.fillStyle = THEME.text;
    ctx.font = '600 18px system-ui, sans-serif';
    ctx.fillText(`${Math.round(progress * 100)}%`, 320, 74 + 130);

    ctx.fillStyle = count > 0 ? THEME.success : THEME.warning;
    ctx.font = '500 18px system-ui, sans-serif';
    ctx.fillText(status, 320, 240);

    ctx.fillStyle = THEME.textFaint;
    ctx.font = '400 15px system-ui, sans-serif';
    ctx.fillText('Re-enter XR to scan again', 320, 282);

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

  private updatePanelPose(): void {
    if (this.panel == null) {
      return;
    }
    const camera = this.world.camera;
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.tmpHead);
    camera.getWorldQuaternion(this.tmpQuat);
    this.tmpForward
      .set(0, 0, -1)
      .applyQuaternion(this.tmpQuat);
    this.panel.position
      .copy(this.tmpHead)
      .addScaledVector(this.tmpForward, 0.95);
    this.panel.position.y -= 0.1;
    this.panel.quaternion.copy(this.tmpQuat);
  }

  private planeCount(): number {
    let count = 0;
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as
        | { orientation?: string; semanticLabel?: string }
        | undefined;
      if (plane == null) {
        continue;
      }
      if (plane.semanticLabel === 'ceiling') {
        continue;
      }
      count++;
    }
    return count;
  }

  private logPlaneState(delta: number): void {
    this.logTimer += delta;
    if (this.logTimer < 1) {
      return;
    }
    this.logTimer = 0;
    const labels: string[] = [];
    for (const entity of this.queries.planes.entities) {
      const plane = entity.getValue(XRPlane, '_plane') as
        | {
            orientation?: string;
            semanticLabel?: string;
            polygon?: DOMPointReadOnly[];
          }
        | undefined;
      if (plane == null) {
        continue;
      }
      const label = plane.semanticLabel ?? plane.orientation ?? 'surface';
      const count = plane.polygon?.length ?? 0;
      labels.push(`${label}(${count}pts)`);
    }
    const signature = labels.sort().join('|');
    if (signature === this.lastPlaneLog) {
      return;
    }
    this.lastPlaneLog = signature;
    console.info(
      `[RoomScan] ${labels.length} plane(s)${labels.length ? `: ${labels.join(', ')}` : ' - keep scanning'}`,
    );
  }
}
