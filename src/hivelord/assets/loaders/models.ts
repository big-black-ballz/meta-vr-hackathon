import {
  AssetManager as SdkAssets,
  Box3,
  Mesh,
  MeshBasicMaterial,
  Object3D,
} from '@iwsdk/core';
import { ASSET_BUDGETS, DEBUG } from '../../core/config.js';
import type { ManifestEntry } from '../manifest.js';
import { getFallbackObject } from '../fallbacks.js';

export interface NormalizedModel {
  key: string;
  /** Normalized cached root. Clone via getModelScene(); never parent directly. */
  scene: Object3D;
  triangles: number;
  min: [number, number, number];
  max: [number, number, number];
}

/** Small shared material set. Textured materials are kept, not replaced. */
const sharedMaterials = new Map<string, MeshBasicMaterial>();

function sharedMaterial(slot: string): MeshBasicMaterial {
  let m = sharedMaterials.get(slot);
  if (m == null) {
    const color =
      slot === 'glow_gold'
        ? 0xf5c451
        : slot === 'bandit'
          ? 0x3a3348
          : slot === 'prop_dark'
            ? 0x4a4238
            : 0xd9a93a;
    m = new MeshBasicMaterial({ color });
    sharedMaterials.set(slot, m);
  }
  return m;
}

export function isSharedMaterial(material: unknown): boolean {
  for (const m of sharedMaterials.values()) {
    if (m === material) {
      return true;
    }
  }
  return false;
}

function trianglesOf(root: Object3D): number {
  let total = 0;
  root.traverse((child) => {
    if (child instanceof Mesh) {
      const geo = child.geometry;
      const index = geo.getIndex();
      const pos = geo.getAttribute('position');
      total += index != null ? index.count / 3 : pos != null ? pos.count / 3 : 0;
    }
  });
  return Math.round(total);
}

const box = new Box3();
const normalized = new Set<string>();

function normalizeRoot(root: Object3D, entry: ManifestEntry): void {
  root.scale.setScalar(entry.scale ?? 1);
  root.updateMatrixWorld(true);
  box.setFromObject(root);
  if ((entry.origin ?? 'base') === 'base' && Number.isFinite(box.min.y)) {
    root.position.y -= box.min.y;
    root.updateMatrixWorld(true);
    box.setFromObject(root);
  }
  let meshIndex = 0;
  root.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    child.castShadow = false;
    child.receiveShadow = false;
    child.frustumCulled = true;
    if (child.name === '') {
      child.name = `${entry.id}_mesh${meshIndex++}`;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    const mapped = materials.map((m) => {
      const mat = m as MeshBasicMaterial & { map?: unknown };
      if (mat != null && mat.map != null) {
        return m; // textured: keep the original, preserve intent
      }
      const previous = m as MeshBasicMaterial;
      const next = sharedMaterial(entry.material ?? 'bot');
      if (
        previous != null &&
        previous !== next &&
        !isSharedMaterial(previous) &&
        typeof previous.dispose === 'function'
      ) {
        previous.dispose();
      }
      return next;
    });
    child.material = Array.isArray(child.material) ? mapped : mapped[0];
  });
}

/**
 * Loads a model through the SDK GLTF cache, then normalizes the cached root
 * once (scale, origin, shadows, shared materials). Clones inherit it all.
 */
export async function loadModel(
  entry: ManifestEntry,
  url: string,
  _timeoutMs: number,
): Promise<NormalizedModel> {
  await SdkAssets.loadGLTF(url, entry.id);
  const cached = SdkAssets.getGLTF(entry.id, { shared: true });
  if (cached == null) {
    throw new Error(`SDK cache missed right after load for ${entry.id}`);
  }
  if (!normalized.has(entry.id)) {
    normalizeRoot(cached.scene, entry);
    normalized.add(entry.id);
  }
  const triangles = trianglesOf(cached.scene);
  const budget = entry.triangles ?? ASSET_BUDGETS.perModelTriangles;
  if (DEBUG && triangles > budget) {
    console.warn(
      `[Hivelord] model ${entry.id} has ${triangles} triangles, budget ${budget}`,
    );
  }
  box.setFromObject(cached.scene);
  const min = box.min;
  const max = box.max;
  return {
    key: entry.id,
    scene: cached.scene,
    triangles,
    min: [min.x, min.y, min.z],
    max: [max.x, max.y, max.z],
  };
}

/** Fresh clone sharing geometry/materials, or a bot fallback instance. */
export function getModelScene(id: string): Object3D {
  try {
    const clone = SdkAssets.getGLTF(id);
    if (clone != null) {
      return clone.scene;
    }
  } catch {
    // Fall through to the fallback below.
  }
  return getFallbackObject('bot');
}

function firstMesh(id: string): Mesh | null {
  try {
    const cached = SdkAssets.getGLTF(id, { shared: true });
    if (cached == null) {
      return null;
    }
    let found: Mesh | null = null;
    cached.scene.traverse((child) => {
      if (found == null && child instanceof Mesh) {
        found = child;
      }
    });
    return found;
  } catch {
    return null;
  }
}

/** Shared geometry for Level 5 instancing (fallback geometry, never null). */
export function getGeometry(id: string): unknown {
  const mesh = firstMesh(id);
  if (mesh != null) {
    return mesh.geometry;
  }
  const fallback = firstMeshFallback();
  return fallback?.geometry ?? null;
}

let fallbackMeshCache: Mesh | null = null;

function firstMeshFallback(): Mesh | null {
  if (fallbackMeshCache != null) {
    return fallbackMeshCache;
  }
  const obj = getFallbackObject('bot');
  obj.traverse((child) => {
    if (fallbackMeshCache == null && child instanceof Mesh) {
      fallbackMeshCache = child;
    }
  });
  return fallbackMeshCache;
}

/** Shared material for Level 5 instancing (fallback material, never null). */
export function getMaterial(id: string): unknown {
  const mesh = firstMesh(id);
  if (mesh != null) {
    const material = mesh.material;
    return Array.isArray(material) ? material[0] ?? null : material;
  }
  return fallbackMeshCache?.material ?? sharedMaterial('bot');
}

/** Evicts model GPU resources; three re-uploads from retained attributes on demand. */
export function disposeModel(record: NormalizedModel): void {
  record.scene.traverse((child) => {
    if (!(child instanceof Mesh)) {
      return;
    }
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const m of materials) {
      if (!isSharedMaterial(m) && typeof m.dispose === 'function') {
        m.dispose();
      }
    }
    child.geometry.dispose();
  });
  normalized.delete(record.key);
}
