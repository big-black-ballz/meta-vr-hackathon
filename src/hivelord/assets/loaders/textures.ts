import {
  AssetManager as SdkAssets,
  SRGBColorSpace,
  Texture,
} from '@iwsdk/core';
import type { ManifestEntry } from '../manifest.js';
import { getFallbackTexture } from '../fallbacks.js';

function isDataMap(id: string, url: string): boolean {
  const name = `${id} ${url}`.toLowerCase();
  return (
    name.includes('data') ||
    name.includes('rough') ||
    name.includes('normal') ||
    name.includes('metal') ||
    name.includes('ao')
  );
}

function applyTexturePolicy(
  tex: Texture,
  entry: ManifestEntry,
  maxAnisotropy: number,
): void {
  const budget = entry.textureMax ?? 1024;
  const image = tex.image as
    | { width?: number; height?: number }
    | undefined;
  const width = image?.width ?? 0;
  const height = image?.height ?? 0;
  if (width > budget || height > budget) {
    const scale = budget / Math.max(width, height);
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.floor(width * scale));
    canvas.height = Math.max(1, Math.floor(height * scale));
    const ctx = canvas.getContext('2d');
    if (ctx != null && image != null) {
      ctx.drawImage(
        image as CanvasImageSource,
        0,
        0,
        canvas.width,
        canvas.height,
      );
      tex.image = canvas;
      tex.needsUpdate = true;
    }
  }
  tex.generateMipmaps = true;
  tex.anisotropy = Math.max(2, Math.min(4, maxAnisotropy));
  if (!isDataMap(entry.id, entry.url)) {
    tex.colorSpace = SRGBColorSpace;
  }
}

/** Loads a texture through the SDK cache, then clamps size and color space. */
export async function loadTexture(
  entry: ManifestEntry,
  url: string,
  _timeoutMs: number,
  maxAnisotropy: number,
): Promise<Texture> {
  await SdkAssets.loadTexture(url, entry.id);
  const tex = SdkAssets.getTexture(entry.id);
  if (tex == null) {
    throw new Error(`SDK texture cache missed right after load for ${entry.id}`);
  }
  applyTexturePolicy(tex, entry, maxAnisotropy);
  return tex;
}

/** Fetches JSON with a timeout. */
export async function loadJson(url: string, timeoutMs: number): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    return (await response.json()) as unknown;
  } finally {
    clearTimeout(timer);
  }
}

/** Decodes an image off-thread where possible, wrapped as a Texture. */
export async function loadImage(
  entry: ManifestEntry,
  url: string,
  timeoutMs: number,
  maxAnisotropy: number,
): Promise<Texture> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} for ${url}`);
    }
    const blob = await response.blob();
    let source: ImageBitmap | HTMLImageElement;
    if (typeof createImageBitmap === 'function') {
      source = await createImageBitmap(blob);
    } else {
      source = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        const objectUrl = URL.createObjectURL(blob);
        img.onload = () => {
          URL.revokeObjectURL(objectUrl);
          resolve(img);
        };
        img.onerror = () => {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(`decode failed for ${url}`));
        };
        img.src = objectUrl;
      });
    }
    const canvas = document.createElement('canvas');
    canvas.width = 'width' in source ? source.width : 256;
    canvas.height = 'height' in source ? source.height : 160;
    const ctx = canvas.getContext('2d');
    if (ctx == null) {
      throw new Error(`2d context unavailable for ${url}`);
    }
    ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
    if ('close' in source && typeof source.close === 'function') {
      source.close();
    }
    const { CanvasTexture } = await import('@iwsdk/core');
    const tex = new CanvasTexture(canvas);
    tex.name = entry.id;
    applyTexturePolicy(tex, entry, maxAnisotropy);
    return tex;
  } finally {
    clearTimeout(timer);
  }
}

/** Shared texture or the checker fallback (never null). */
export function getTexture(id: string): Texture {
  try {
    const cached = SdkAssets.getTexture(id);
    if (cached != null) {
      return cached;
    }
  } catch {
    // Fall through to the fallback below.
  }
  return getFallbackTexture('texture');
}
