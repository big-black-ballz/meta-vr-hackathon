/**
 * Every tunable gesture threshold lives here.
 *
 * Research basis (see report):
 * - Pinch: thumb-tip to index-tip distance with start/release hysteresis.
 *   Meta's opposition states treat ~1.5 cm as touching; the SDK's own pinch
 *   commit is ~8 mm with an analog open span. Our 25/40 mm band is
 *   deliberately wider so a real pinch commits reliably, and the release edge
 *   sits further out so it does not flicker.
 * - Fist: the WebXR hand-input spec explainer detects a fist from
 *   fingertip-to-knuckle distances plus tip-into-palm orientation. Quest
 *   reports the same hand geometry for all users (privacy mitigation), so
 *   absolute metre thresholds are stable. Extended tip-to-knuckle is ~80 mm,
 *   curled is ~25 mm; the enter edge sits between at 55 mm.
 * - Extension ratio (tip-to-knuckle over that finger's own bone length) is
 *   self-normalising: ~1 straight, ~0.3 full fist, cupped in the middle.
 * - Orientation fist dot (tip -Z into knuckle -Y, spec checkOrientation) is
 *   near 1 curled and near 0 extended, independent of position noise.
 * - Palm normal comes from the middle-knuckle joint orientation (-Y out of
 *   the palm, per spec), never from a position cross product.
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
  // A fist puts thumb and index tips close together, so pinch also requires
  // the index to be fairly straight and the other fingers not all curled.
  pinchMaxIndexBend: 0.85,
  pinchMaxOthersBend: 0.75,
  pinchMinOthersExt: 0.55,

  // Fist: all four fingertips near their knuckles (primary), confirmed by
  // joint bend and tip-into-palm orientation (secondary, OR-ed generously so
  // a partially-tracked Quest fist still counts).
  fistTipEnterM: 0.055,
  fistTipExitM: 0.065,
  fistTipMaxM: 0.075,
  fistEnterBend: 0.6,
  fistExitBend: 0.5,
  fistEnterDot: 0.45,
  fistExitDot: 0.35,

  // Extended finger: tip far from its knuckle AND fairly straight. Both must
  // hold so a splayed but bent hand is not "extended".
  extendedTipEnterM: 0.062,
  extendedTipExitM: 0.055,
  extendedBendMax: 0.5,
  extendedDotMax: 0.45,

  // Cupped: palm up, fingers half-curled, fingers together. Bend is the
  // primary shape signal; tip distance keeps it out of fist/open territory.
  cuppedEnterDot: 0.5,
  cuppedExitDot: 0.4,
  cuppedBendMin: 0.2,
  cuppedBendMax: 1.0,
  cuppedBendSlack: 0.12,
  cuppedTipMinM: 0.03,
  cuppedTipMaxM: 0.085,
  // Measured open-hand spread on the synthetic skeleton is ~2.6 (small
  // wrist-to-MCP normaliser); a cupped hand with fingers together reads much
  // lower, but keep the ceiling generous so spread never vetoes a cupped
  // hand. Bend + palm-up are the real separators (cupped outranks open).
  cuppedMaxSpread: 1.7,
  cuppedSpreadSlack: 0.15,

  // Flat palm: fingers extended, palm normal points at the aim direction.
  // The aim direction is head yaw-forward until wall targeting (Level 9).
  flatEnterDot: 0.65,
  flatExitDot: 0.55,

  // Open palm: fingers extended and spread. Spread is index-tip to pinky-tip
  // distance divided by hand size.
  openSpreadEnter: 0.95,
  openSpreadExit: 0.8,

  // Two-palm stop: both palms face the aim direction, in front of the chest.
  stopEnterDot: 0.55,
  stopExitDot: 0.45,
  stopMinForwardM: 0.15,
  stopMaxForwardM: 0.8,
  stopMinBelowHeadM: 0.0,
  stopMaxBelowHeadM: 0.75,
  stopMaxLateralM: 0.65,

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
