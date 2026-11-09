/** Gesture identifiers shared by detection, events, UI and the ability table. */
export const GESTURE_IDS = [
  'pinch',
  'fist',
  'flatPalm',
  'cupped',
  'openPalm',
  'stop',
] as const;

export type GestureId = (typeof GESTURE_IDS)[number];

export type HandId = 'left' | 'right';
export type GestureHand = HandId | 'both';

export type GestureStateId = 'None' | 'Candidate' | 'Active' | 'Releasing';

export interface Vec3Payload {
  x: number;
  y: number;
  z: number;
}

export interface GestureData {
  pinchPoint: Vec3Payload;
  palmNormal: Vec3Payload;
  palmPosition: Vec3Payload;
  fingertipPosition: Vec3Payload;
}

/**
 * Lower index wins. Only the highest-priority gesture on a hand may be the
 * primary Active gesture. Two-palm stop is handled separately and overrides
 * both hands.
 */
export const GESTURE_PRIORITY: readonly GestureId[] = [
  'pinch',
  'fist',
  'cupped',
  'flatPalm',
  'openPalm',
];

export function gesturePriority(gesture: GestureId): number {
  const index = GESTURE_PRIORITY.indexOf(gesture);
  return index === -1 ? GESTURE_PRIORITY.length : index;
}

export const GESTURE_LABELS: Record<GestureId, string> = {
  pinch: 'Pinch',
  fist: 'Fist',
  flatPalm: 'Flat palm',
  cupped: 'Cupped',
  openPalm: 'Open palm',
  stop: 'Stop',
};

/**
 * Placeholder ability table for later levels. Level 1 only reports the
 * mapping; no ability is implemented or fired.
 */
export const GESTURE_ABILITIES: Record<GestureId, string> = {
  pinch: 'the-call',
  fist: 'gather',
  flatPalm: 'wall-crawl',
  cupped: 'scout',
  stop: 'shield',
  openPalm: 'scatter',
};

export function getAbilityForGesture(gesture: GestureId): string {
  return GESTURE_ABILITIES[gesture];
}
