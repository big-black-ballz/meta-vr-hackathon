import { ASSET_BUDGETS, DEBUG } from '../core/config.js';

export interface SceneNumbers {
  triangles: number;
  drawCalls: number;
  geometries: number;
  textures: number;
}

/** Width*height*4 bytes plus ~33% mipmap overhead, in megabytes. */
export function estimateTextureMB(width: number, height: number): number {
  return (width * height * 4 * 1.33) / 1048576;
}

/**
 * Compares live renderer numbers plus our texture-memory estimate against
 * config budgets. Returns warning strings (dev console only, warn once per
 * key per session).
 */
const warned = new Set<string>();

export function checkSceneBudgets(
  numbers: SceneNumbers,
  textureMemoryMB: number,
  downloadMB: number,
): string[] {
  const warnings: string[] = [];
  const check = (
    key: string,
    actual: number,
    budget: number,
    label: string,
  ): void => {
    if (actual > budget && !warned.has(key)) {
      warned.add(key);
      warnings.push(
        `[Hivelord] budget exceeded: ${label} ${actual} > ${budget}`,
      );
    }
  };
  check('tri', numbers.triangles, ASSET_BUDGETS.sceneTriangles, 'scene triangles');
  check('dc', numbers.drawCalls, ASSET_BUDGETS.drawCalls, 'draw calls');
  check('texmem', textureMemoryMB, ASSET_BUDGETS.textureMemoryMB, 'texture memory MB');
  check('dl', downloadMB, ASSET_BUDGETS.downloadMB, 'download MB');
  if (DEBUG) {
    for (const warning of warnings) {
      console.warn(warning);
    }
  }
  return warnings;
}

export function resetBudgetWarnings(): void {
  warned.clear();
}
