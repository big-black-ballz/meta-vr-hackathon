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
  // A closed fist can put thumb and index tips close together. Only allow a
  // pinch when the index is not fully curled. Bend is 0 = straight, ~1 = fist.
  pinchMaxIndexBend: 0.85,

  // Fist: fingertip-to-palm distance over the four fingers, with a joint-bend
  // fallback because Quest often reports a fist as only partly closed.
  fistEnterCurl: 0.45,
  fistExitCurl: 0.55,
  fistMaxCurl: 0.7,
  fistEnterBend: 0.55,
  fistExitBend: 0.45,

  // Extended finger: tip-to-palm distance above this fraction of hand size.
  extendedEnterCurl: 0.7,
  extendedExitCurl: 0.62,

  // Cupped: palm normal points up and the fingers are partly curled.
  // Bend is measured from the top two finger joints (Meta's curl feature).
  cuppedEnterDot: 0.55,
  cuppedExitDot: 0.45,
  cuppedBendMin: 0.15,
  cuppedBendMax: 0.95,
  cuppedBendSlack: 0.1,
  // Cupped fingers stay together; open palm requires spread.
  cuppedMaxSpread: 1.15,
  cuppedSpreadSlack: 0.1,

  // Flat palm: fingers extended, palm normal points at the aim direction.
  // The aim direction is head-forward until wall targeting arrives in Level 9.
  flatEnterDot: 0.8,
  flatExitDot: 0.7,

  // Open palm: fingers extended and spread. Spread is index-tip to pinky-tip
  // distance divided by hand size.
  openSpreadEnter: 1.0,
  openSpreadExit: 0.85,

  // Two-palm stop: both palms face the aim direction, in front of the chest.
  stopEnterDot: 0.6,
  stopExitDot: 0.5,
  stopMinForwardM: 0.2,
  stopMaxForwardM: 0.75,
  stopMinBelowHeadM: 0.05,
  stopMaxBelowHeadM: 0.7,
  stopMaxLateralM: 0.6,

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
