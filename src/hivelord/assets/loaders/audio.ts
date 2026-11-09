import { AssetManager as SdkAssets } from '@iwsdk/core';
import type { ManifestEntry } from '../manifest.js';
import { getFallbackAudio } from '../fallbacks.js';

let sharedContext: AudioContext | null = null;
let unlocked = false;
let pointerHooked = false;

/** Shared context for fallback audio. Created on first unlock. */
export function getAudioContext(): AudioContext | null {
  return sharedContext;
}

/** True once a user gesture or XR session start has unlocked audio. */
export function audioUnlocked(): boolean {
  return unlocked;
}

/** Creates/resumes the shared context. Safe to call repeatedly. */
export function unlockAudio(): void {
  try {
    if (sharedContext == null) {
      sharedContext =
        new window.AudioContext({
          latencyHint: 'interactive',
        });
    }
    if (sharedContext.state === 'suspended') {
      void sharedContext.resume();
    }
    unlocked = sharedContext.state === 'running';
    if (!unlocked) {
      const onState = (): void => {
        if (sharedContext?.state === 'running') {
          unlocked = true;
        }
      };
      sharedContext.addEventListener('statechange', onState, { once: true });
    }
  } catch {
    sharedContext = null;
    unlocked = false;
  }
}

/** One-time pointerdown hook; XR-session hook lives in AssetSystem. */
export function hookFirstGestureUnlock(): void {
  if (pointerHooked) {
    return;
  }
  pointerHooked = true;
  const onGesture = (): void => {
    unlockAudio();
  };
  document.addEventListener('pointerdown', onGesture, { once: true });
}

/** Decodes audio through the SDK cache (sfx fully, voice/music on demand). */
export async function loadAudio(
  entry: ManifestEntry,
  url: string,
  _timeoutMs: number,
): Promise<AudioBuffer> {
  await SdkAssets.loadAudio(url, entry.id);
  const buffer = SdkAssets.getAudio(entry.id);
  if (buffer == null) {
    throw new Error(`SDK audio cache missed right after load for ${entry.id}`);
  }
  return buffer;
}

/** Cached buffer or generated silence (never null, never throws). */
export function getAudio(id: string): AudioBuffer | null {
  try {
    const cached = SdkAssets.getAudio(id);
    if (cached != null) {
      return cached;
    }
  } catch {
    // Fall through to silence below.
  }
  if (sharedContext == null) {
    return null;
  }
  return getFallbackAudio(sharedContext);
}
