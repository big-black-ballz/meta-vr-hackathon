import {
  BoxGeometry,
  Mesh,
  Scene,
  type Material,
  type Texture,
  type WebGLRenderer,
  type PerspectiveCamera,
} from '@iwsdk/core';
import { ASSET_FRAME_BUDGET_MS } from '../core/config.js';
import type { NormalizedModel } from './loaders/models.js';

const unitBox = new BoxGeometry(1, 1, 1);

/**
 * GPU warm-up spread across frames (≤8 ms each): texture upload via
 * initTexture plus one shader compile per material in a hidden scene while
 * the loading screen is still visible. Reports total warm-up time.
 */
export class WarmupQueue {
  private readonly scene = new Scene();
  private materials: Material[] = [];
  private textures: Texture[] = [];
  private startedAt = 0;
  private warmedMs = 0;
  private tempMeshes: Mesh[] = [];

  enqueue(models: NormalizedModel[], textures: Texture[]): void {
    const seen = new Set<Material>();
    for (const model of models) {
      model.scene.traverse((child) => {
        const mesh = child as Mesh & { material?: Material | Material[] };
        if (mesh.isMesh !== true) {
          return;
        }
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m != null && !seen.has(m)) {
            seen.add(m);
          }
        }
      });
    }
    this.materials.push(...seen);
    this.textures.push(...textures);
    if (this.startedAt === 0) {
      this.startedAt = performance.now();
    }
  }

  get pending(): number {
    return this.materials.length + this.textures.length;
  }

  get totalMs(): number {
    return Math.round(this.warmedMs);
  }

  /** Returns true when the queue is empty. Never allocates per call. */
  pump(renderer: WebGLRenderer, camera: PerspectiveCamera): boolean {
    const deadline = performance.now() + ASSET_FRAME_BUDGET_MS;
    const initTexture = (
      renderer as unknown as {
        initTexture?: (texture: Texture) => void;
      }
    ).initTexture?.bind(renderer);
    while (this.textures.length > 0) {
      const tex = this.textures.shift();
      if (tex == null) {
        continue;
      }
      try {
        if (initTexture != null) {
          initTexture(tex);
        }
      } catch {
        // Upload failed; the texture still renders via normal upload path.
      }
      if (performance.now() >= deadline) {
        return false;
      }
    }
    while (this.materials.length > 0) {
      const material = this.materials.pop();
      if (material == null) {
        continue;
      }
      const proxy = new Mesh(unitBox, material);
      this.scene.add(proxy);
      this.tempMeshes.push(proxy);
      try {
        renderer.compile(this.scene, camera);
      } catch {
        // A material that cannot compile here will fail loudly at render.
      }
      if (performance.now() >= deadline) {
        return false;
      }
    }
    for (const proxy of this.tempMeshes) {
      this.scene.remove(proxy);
    }
    this.tempMeshes.length = 0;
    this.warmedMs = performance.now() - this.startedAt;
    return true;
  }
}
