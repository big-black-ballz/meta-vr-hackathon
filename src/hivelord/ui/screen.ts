import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  SRGBColorSpace,
} from '@iwsdk/core';
import type { World } from '@iwsdk/core';

export type ScreenId =
  | 'start'
  | 'loading'
  | 'pause'
  | 'settings'
  | 'skills'
  | 'chapter'
  | 'confirm'
  | 'error'
  | 'gallery';

/** Pixels per metre on UI canvases. */
export const UI_PPM = 1230;

/**
 * Canvas-backed world-space panel. Redraws only when dirty, so text texture
 * uploads stay cheap. Owner positions the mesh; see placement.ts.
 */
export class CanvasPanel {
  readonly mesh: Mesh;
  readonly material: MeshBasicMaterial;
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly widthM: number;
  readonly heightM: number;
  private readonly texture: CanvasTexture;
  private dirty = true;

  constructor(
    world: World,
    name: string,
    widthM: number,
    heightM: number,
  ) {
    this.widthM = widthM;
    this.heightM = heightM;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(widthM * UI_PPM);
    canvas.height = Math.round(heightM * UI_PPM);
    const ctx = canvas.getContext('2d');
    if (ctx == null) {
      throw new Error('[Hivelord] 2d canvas unavailable for UI panel');
    }
    this.canvas = canvas;
    this.ctx = ctx;
    this.texture = new CanvasTexture(canvas);
    this.texture.colorSpace = SRGBColorSpace;
    const material = new MeshBasicMaterial({
      map: this.texture,
      transparent: true,
      depthWrite: false,
      toneMapped: false,
    });
    this.material = material;
    this.mesh = new Mesh(new PlaneGeometry(widthM, heightM), material);
    this.mesh.name = name;
    this.mesh.visible = false;
    this.mesh.renderOrder = 10;
    world.createTransformEntity(this.mesh);
  }

  get widthPx(): number {
    return this.canvas.width;
  }

  get heightPx(): number {
    return this.canvas.height;
  }

  setDirty(): void {
    this.dirty = true;
  }

  setVisible(visible: boolean): void {
    this.mesh.visible = visible;
  }

  setOpacity(opacity: number): void {
    this.material.opacity = Math.max(0, Math.min(1, opacity));
  }

  render(draw: (ctx: CanvasRenderingContext2D) => void): void {
    if (!this.dirty) {
      return;
    }
    this.dirty = false;
    const { ctx, canvas } = this;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    draw(ctx);
    this.texture.needsUpdate = true;
  }
}

/**
 * Base class for blocking UI screens. update() receives UNSCALED delta time
 * so menus keep animating while game time is paused.
 */
export abstract class UIScreen {
  abstract readonly id: ScreenId;
  blocking = true;
  panel: CanvasPanel | null = null;
  visible = false;

  abstract build(world: World): void;
  abstract draw(ctx: CanvasRenderingContext2D): void;

  onShow(_data?: unknown): void {}
  onHide(): void {}

  update(_dt: number): void {}

  /** A control was activated (click, poke or dev key). */
  onControl(_controlId: string): void {}

  show(): void {
    this.visible = true;
    this.panel?.setVisible(true);
    this.panel?.setDirty();
    this.onShow();
  }

  hide(): void {
    this.visible = false;
    this.panel?.setVisible(false);
    this.onHide();
  }
}
