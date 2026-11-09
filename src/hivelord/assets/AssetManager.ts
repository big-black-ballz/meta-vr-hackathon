import {
  ASSET_CONCURRENCY,
  ASSET_RETRIES,
  ASSET_TIMEOUT_MS,
  DEBUG,
} from '../core/config.js';
import { hivelordEvents } from '../core/EventBus.js';
import { assetUrl } from './assetUrl.js';
import {
  getEntry,
  getGroup,
  type AssetGroupName,
  type FallbackKind,
  type ManifestEntry,
} from './manifest.js';
import { disposeModel, loadModel, type NormalizedModel } from './loaders/models.js';
import { loadAudio } from './loaders/audio.js';
import { getFallbackTexture } from './fallbacks.js';
import { loadImage, loadJson, loadTexture } from './loaders/textures.js';
import type { Texture } from '@iwsdk/core';

export type FailMode = 'off' | 'missing' | 'corrupt' | 'timeout' | 'slow';

let failMode: FailMode = 'off';
let maxAnisotropy = 4;

/** Set by devtools (task 13). Loaders never import devtools, so no cycle. */
export function setFailMode(mode: FailMode): void {
  failMode = mode;
}

export function getFailMode(): FailMode {
  return failMode;
}

/** Renderer cap, set once by AssetSystem init. */
export function setMaxAnisotropy(value: number): void {
  maxAnisotropy = Math.max(1, Math.min(8, Math.floor(value)));
}

export interface LoadedRecord {
  entry: ManifestEntry;
  model: NormalizedModel | null;
  texture: Texture | null;
  audio: AudioBuffer | null;
  json: unknown;
  fromFallback: boolean;
  refs: Set<string>;
  estBytes: number;
}

export interface GroupResult {
  failed: number;
  ms: number;
  cancelled: boolean;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function failureError(url: string): Error {
  if (failMode === 'timeout') {
    return new Error(`simulated timeout for ${url}`);
  }
  if (failMode === 'corrupt') {
    return new Error(`simulated corrupt payload for ${url}`);
  }
  return new Error(`simulated missing file ${url}`);
}

function applyFailMode(entry: ManifestEntry, url: string): string {
  if (failMode === 'missing') {
    return 'models/__missing__.glb';
  }
  if (failMode === 'corrupt' && entry.type === 'model') {
    return 'models/test_corrupt.glb';
  }
  return url;
}

const records = new Map<string, LoadedRecord>();
const inflight = new Map<string, Promise<LoadedRecord>>();
const cancelledGroups = new Set<string>();
const groupMs = new Map<string, number>();
let fallbacksUsed = 0;
let loadFailures = 0;

type LoadOutcome =
  | { kind: 'model'; model: NormalizedModel }
  | { kind: 'texture' }
  | { kind: 'audio' }
  | { kind: 'json'; json: unknown }
  | { kind: 'image' }
  | { kind: 'failed'; reason: string };

async function loadWithRetry(
  entry: ManifestEntry,
  url: string,
): Promise<LoadOutcome> {
  const timeout = ASSET_TIMEOUT_MS;
  let attempt = 0;
  for (;;) {
    try {
      if (failMode === 'timeout' || failMode === 'corrupt') {
        await sleep(failMode === 'timeout' ? 1200 : 150);
        throw failureError(url);
      }
      if (failMode === 'slow') {
        await sleep(600);
      }
      const effectiveUrl = assetUrl(applyFailMode(entry, url));
      if (entry.type === 'model') {
        const model = await loadModel(entry, effectiveUrl, timeout);
        return { kind: 'model', model };
      }
      if (entry.type === 'texture') {
        await loadTexture(entry, effectiveUrl, timeout, maxAnisotropy);
        return { kind: 'texture' };
      }
      if (entry.type === 'audio') {
        await loadAudio(entry, effectiveUrl, timeout);
        return { kind: 'audio' };
      }
      if (entry.type === 'json') {
        const json = await loadJson(effectiveUrl, timeout);
        return { kind: 'json', json };
      }
      await loadImage(entry, effectiveUrl, timeout, maxAnisotropy);
      return { kind: 'image' };
    } catch (error) {
      attempt++;
      if (attempt > ASSET_RETRIES) {
        return {
          kind: 'failed',
          reason: error instanceof Error ? error.message : String(error),
        };
      }
      await sleep(300 * attempt * attempt);
    }
  }
}

function makeFallbackRecord(entry: ManifestEntry, reason: string): LoadedRecord {
  fallbacksUsed++;
  loadFailures++;
  hivelordEvents.emit('AssetFallbackUsed', { id: entry.id, kind: entry.fallbackId });
  if (DEBUG) {
    console.warn(`[Hivelord] asset ${entry.id} -> fallback (${reason})`);
  }
  return {
    entry,
    model: null,
    texture: entry.type === 'texture' || entry.type === 'image' ? getFallbackTexture(entry.fallbackId) : null,
    audio: null,
    json: null,
    fromFallback: true,
    refs: new Set<string>(),
    estBytes: 0,
  };
}

function fetchRecord(entry: ManifestEntry): Promise<LoadedRecord> {
  const existing = inflight.get(entry.id);
  if (existing != null) {
    return existing;
  }
  const task = (async (): Promise<LoadedRecord> => {
    const url = entry.url;
    const outcome = await loadWithRetry(entry, url);
    if (outcome.kind !== 'failed') {
      const record: LoadedRecord = {
        entry,
        model: outcome.kind === 'model' ? outcome.model : null,
        texture: null,
        audio: null,
        json: outcome.kind === 'json' ? outcome.json : null,
        fromFallback: false,
        refs: new Set<string>(),
        estBytes: estimateBytes(
          entry,
          outcome.kind === 'model' ? outcome.model : undefined,
        ),
      };
      return record;
    }
    hivelordEvents.emit('AssetFailed', {
      id: entry.id,
      group: entry.group,
      reason: outcome.reason,
      critical: entry.critical,
    });
    return makeFallbackRecord(entry, outcome.reason);
  })();
  inflight.set(entry.id, task);
  const cleanup = (): void => {
    inflight.delete(entry.id);
  };
  void task.then(cleanup, cleanup);
  return task;
}

function estimateBytes(entry: ManifestEntry, model?: NormalizedModel): number {
  if (model != null) {
    return model.triangles * 36;
  }
  return entry.approxSizeKB * 1024;
}

/**
 * Loads every entry of a group with bounded concurrency. Progress is
 * weighted by approxSizeKB. Non-critical failures resolve to fallbacks and
 * continue; a critical failure rejects so the caller can raise ErrorScreen.
 * Cancel-safe: late completions for a cancelled group are dropped silently.
 */
export async function loadGroup(
  name: AssetGroupName,
  onProgress?: (loaded: number, total: number) => void,
): Promise<GroupResult> {
  const started = performance.now();
  cancelledGroups.delete(name);
  const entries = getGroup(name);
  const totalWeight = entries.reduce((sum, e) => sum + Math.max(1, e.approxSizeKB), 0);
  let doneWeight = 0;
  let failed = 0;
  let criticalFailed: ManifestEntry | null = null;
  const queue = [...entries];
  const workers: Array<Promise<void>> = [];
  const workerCount = Math.max(1, Math.min(ASSET_CONCURRENCY, queue.length));
  for (let w = 0; w < workerCount; w++) {
    workers.push(
      (async (): Promise<void> => {
        for (;;) {
          if (cancelledGroups.has(name)) {
            return;
          }
          const entry = queue.shift();
          if (entry == null) {
            return;
          }
          try {
            const record = await fetchRecord(entry);
            if (cancelledGroups.has(name)) {
              return;
            }
            const known = records.get(entry.id);
            if (known != null) {
              known.refs.add(name);
            } else {
              record.refs.add(name);
              records.set(entry.id, record);
            }
            if (record.fromFallback) {
              failed++;
              if (entry.critical) {
                criticalFailed = entry;
              }
            }
          } catch (error) {
            failed++;
            hivelordEvents.emit('AssetFailed', {
              id: entry.id,
              group: name,
              reason: error instanceof Error ? error.message : String(error),
              critical: entry.critical,
            });
            if (entry.critical) {
              criticalFailed = entry;
            }
          } finally {
            doneWeight += Math.max(1, entry.approxSizeKB);
            hivelordEvents.emit('AssetProgress', {
              group: name,
              loaded: Math.min(doneWeight, totalWeight),
              total: totalWeight,
            });
            onProgress?.(Math.min(doneWeight, totalWeight), totalWeight);
          }
        }
      })(),
    );
  }
  await Promise.all(workers);
  const ms = performance.now() - started;
  groupMs.set(name, ms);
  const cancelled = cancelledGroups.has(name);
  cancelledGroups.delete(name);
  hivelordEvents.emit('AssetGroupLoaded', { group: name, ms: Math.round(ms), failed });
  if (criticalFailed != null && !cancelled) {
    throw new Error(
      `critical asset ${(criticalFailed as ManifestEntry).id} failed in group ${name}`,
    );
  }
  return { failed, ms, cancelled };
}

/** Loads one manifest entry outside groups (voice lines, on-demand audio). */
export async function loadAsset(id: string): Promise<LoadedRecord> {
  const entry = getEntry(id);
  if (entry == null) {
    throw new Error(`unknown asset id '${id}'`);
  }
  const known = records.get(id);
  if (known != null) {
    known.refs.add('manual');
    return known;
  }
  const record = await fetchRecord(entry);
  const stored = records.get(id);
  if (stored != null) {
    stored.refs.add('manual');
    return stored;
  }
  record.refs.add('manual');
  records.set(id, record);
  return record;
}

/** Loaded record or its fallback descriptor. Never undefined. */
export function get(
  id: string,
): LoadedRecord | { fallback: FallbackKind } {
  const known = records.get(id);
  if (known != null) {
    return known;
  }
  const entry = getEntry(id);
  return { fallback: entry?.fallbackId ?? 'model' };
}

export function has(id: string): boolean {
  return records.has(id);
}

/** True when every entry of the group has a stored record. */
export function isReady(name: AssetGroupName): boolean {
  return getGroup(name).every((entry) => records.has(entry.id));
}

/** Stops scheduling new loads for a group; late completions are dropped. */
export function cancelGroup(name: string): void {
  cancelledGroups.add(name);
}

/** Drops one manual record when no group references it. */
export function unloadAsset(id: string): void {
  const record = records.get(id);
  if (record == null) {
    return;
  }
  record.refs.delete('manual');
  if (record.refs.size === 0) {
    disposeRecord(record);
    records.delete(id);
  }
}

/** Disposes group-exclusive GPU resources (shared/fallbacks untouched). */
export function unloadGroup(name: AssetGroupName): void {
  for (const [id, record] of [...records]) {
    record.refs.delete(name);
    if (record.refs.size === 0 && !record.refs.has('manual')) {
      disposeRecord(record);
      records.delete(id);
    }
  }
}

function disposeRecord(record: LoadedRecord): void {
  if (record.model != null) {
    disposeModel(record.model);
  }
  if (record.texture != null) {
    record.texture.dispose();
  }
}

export function getGroupModels(name: AssetGroupName): NormalizedModel[] {
  const out: NormalizedModel[] = [];
  for (const entry of getGroup(name)) {
    const record = records.get(entry.id);
    if (record?.model != null && !record.fromFallback) {
      out.push(record.model);
    }
  }
  return out;
}

export interface AssetStats {
  loadedAssets: number;
  bytesLoaded: number;
  fallbacksUsed: number;
  loadFailures: number;
  groupMs: Record<string, number>;
}

export function getStats(): AssetStats {
  let bytesLoaded = 0;
  for (const record of records.values()) {
    bytesLoaded += record.estBytes;
  }
  const ms: Record<string, number> = {};
  for (const [group, value] of groupMs) {
    ms[group] = Math.round(value);
  }
  return {
    loadedAssets: records.size,
    bytesLoaded,
    fallbacksUsed,
    loadFailures,
    groupMs: ms,
  };
}
