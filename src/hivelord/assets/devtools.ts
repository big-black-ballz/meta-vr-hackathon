import {
  CanvasTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Vector3,
} from '@iwsdk/core';
import type { Entity, Quaternion, World } from '@iwsdk/core';
import {
  getGroupModels,
  getStats,
  loadGroup,
  setFailMode,
  unloadGroup,
  type FailMode,
} from './AssetManager.js';
import { getModelScene } from './loaders/models.js';
import type { AssetGroupName } from './manifest.js';
import { GameStates, gameState } from '../core/GameState.js';
import { setErrorMessage } from '../ui/UIManager.js';

const FAIL_MODES: FailMode[] = ['off', 'missing', 'corrupt', 'timeout', 'slow'];
let failIndex = 0;

interface GalleryItem {
  entity: Entity;
}

let gallery: GalleryItem[] = [];
const tmpPos = new Vector3();
const tmpLabel = new Vector3();

function makeLabel(text: string): Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 64;
  const ctx = canvas.getContext('2d');
  if (ctx != null) {
    ctx.fillStyle = 'rgba(8, 15, 26, 0.85)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.fillStyle = '#f5c451';
    ctx.font = '500 22px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text.slice(0, 30), 128, 32, 244);
  }
  const texture = new CanvasTexture(canvas);
  const mesh = new Mesh(
    new PlaneGeometry(0.3, 0.075),
    new MeshBasicMaterial({ map: texture, transparent: true, depthWrite: false }),
  );
  mesh.name = `asset-gallery-label:${text}`;
  return mesh;
}

/**
 * Dev-only tools (gated by DEBUG at the call site in AssetSystem):
 * - X: spawn every loaded model in a row within seated reach with a label,
 *   triangle count and fallback marker. X again (or unload) clears it.
 * - Z: cycle failure simulation off -> missing -> corrupt -> timeout -> slow.
 * - reloadGroup(name): unload then reload, logging both timings.
 */
export function toggleGallery(world: World, headPos: Vector3, headQuat: Quaternion): void {
  if (gallery.length > 0) {
    clearGallery();
    return;
  }
  const forward = new Vector3(0, 0, -1).applyQuaternion(headQuat);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) {
    forward.set(0, 0, -1);
  }
  forward.normalize();
  const right = new Vector3(1, 0, 0).applyQuaternion(headQuat);
  right.y = 0;
  if (right.lengthSq() < 1e-6) {
    right.set(1, 0, 0);
  }
  right.normalize();
  const models = getGroupModels('boot').concat(getGroupModels('chapter1'));
  const stats = getStats();
  console.info(
    `[Hivelord] asset gallery: ${models.length} models, ${stats.loadedAssets} loaded, ${stats.fallbacksUsed} fallbacks`,
  );
  let index = 0;
  for (const model of models) {
    const instance = getModelScene(model.key);
    tmpPos
      .copy(headPos)
      .addScaledVector(forward, 0.55)
      .addScaledVector(right, (index - (models.length - 1) / 2) * 0.35);
    tmpPos.y = Math.max(0.3, headPos.y - 0.35);
    instance.position.copy(tmpPos);
    const span = Math.max(
      model.max[0] - model.min[0],
      model.max[1] - model.min[1],
      model.max[2] - model.min[2],
      0.001,
    );
    const scale = Math.min(1, 0.25 / span);
    instance.scale.setScalar(scale);
    gallery.push({ entity: world.createTransformEntity(instance) });
    tmpLabel.copy(tmpPos);
    tmpLabel.y += 0.22;
    const label = makeLabel(`${model.key} ${model.triangles}tri`);
    label.position.copy(tmpLabel);
    gallery.push({ entity: world.createTransformEntity(label) });
    index++;
  }
}

export function clearGallery(): void {
  for (const item of gallery) {
    item.entity.dispose();
  }
  gallery = [];
}

export function cycleFailMode(): FailMode {
  failIndex = (failIndex + 1) % FAIL_MODES.length;
  const mode = FAIL_MODES[failIndex] ?? 'off';
  setFailMode(mode);
  console.info(`[Hivelord] asset fail-sim: ${mode}`);
  return mode;
}

export async function reloadGroup(name: AssetGroupName): Promise<void> {
  const before = getStats().groupMs[name] ?? 0;
  unloadGroup(name);
  try {
    const result = await loadGroup(name);
    const after = getStats().groupMs[name] ?? 0;
    console.info(
      `[Hivelord] asset reload ${name}: was ${before}ms, now ${after}ms, failed ${result.failed}`,
    );
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    console.error(`[Hivelord] asset reload ${name} failed: ${reason}`);
    setErrorMessage(`Asset reload failed: ${reason}`);
    gameState.setState(GameStates.Error, 'asset reload failed');
  }
}

export function isGalleryOpen(): boolean {
  return gallery.length > 0;
}
