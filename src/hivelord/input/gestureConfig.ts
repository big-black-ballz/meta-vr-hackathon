/**
 * Every tunable gesture threshold lives here.
 *
 * IMPORTANT: these are starting values. They have not been tuned on a physical
 * headset yet; expect to adjust pinch distances and curl ranges for real hands.
 * Distances are metres. Curl and spread values are normalised by hand size
 * (wrist to middle-finger metacarpal).
 */
export const GESTURE_CONFIG = {
  /** A hand keeps its last pose for this long before it is declared lost. */
  trackingGraceSeconds: 0.3,

  /** Consecutive frames needed to enter the Active state. */
  enterFrames: 4,
  /** Consecutive frames needed to leave the Active state. */
  releaseFrames: 4,

  // Pinch uses two thresholds for hysteresis: start below, release above.
  pinchStartM: 0.025,
  pinchEndM: 0.04,

  // Fist: average fingertip-to-palm distance over the four fingers.
  fistEnterCurl: 0.35,
  fistExitCurl: 0.45,

  // Extended finger: tip-to-palm distance above this fraction of hand size.
  extendedEnterCurl: 0.7,
  extendedExitCurl: 0.62,

  // Cupped: palm normal points up and the fingers are partly curled.
  cuppedEnterDot: 0.7,
  cuppedExitDot: 0.6,
  cuppedCurlMin: 0.4,
  cuppedCurlMax: 0.65,
  cuppedCurlSlack: 0.08,

  // Flat palm: fingers extended, palm normal points at the aim direction.
  // The aim direction is head-forward until wall targeting arrives in Level 9.
  flatEnterDot: 0.8,
  flatExitDot: 0.7,

  // Open palm: fingers extended and spread. Spread is index-tip to pinky-tip
  // distance divided by hand size.
  openSpreadEnter: 1.0,
  openSpreadExit: 0.85,

  // Two-palm stop: both palms face the aim direction, in front of the chest.
  stopEnterDot: 0.7,
  stopExitDot: 0.6,
  stopMinForwardM: 0.3,
  stopMaxForwardM: 0.6,
  stopMinBelowHeadM: 0.15,
  stopMaxBelowHeadM: 0.55,
  stopMaxLateralM: 0.4,

  // Guard against degenerate joint data.
  minHandSizeM: 0.02,
} as const;

/**
 * Dev-only forced-gesture keys. Hold the key to hold the gesture.
 * Shift selects the left hand; without Shift the right hand is used.
 * Key 6 (stop) is two-handed and ignores the hand selector.
 */
export const FORCE_GESTURE_KEYS = [
  { code: 'Digit1', gesture: 'pinch' },
  { code: 'Digit2', gesture: 'fist' },
  { code: 'Digit3', gesture: 'flatPalm' },
  { code: 'Digit4', gesture: 'cupped' },
  { code: 'Digit5', gesture: 'openPalm' },
  { code: 'Digit6', gesture: 'stop' },
] as const;

export const FORCE_LEFT_MODIFIER_KEYS = ['ShiftLeft', 'ShiftRight'] as const;
