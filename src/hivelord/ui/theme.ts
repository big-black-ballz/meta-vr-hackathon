/**
 * Single source of UI theme tokens: dark base, cyan primary, violet accent,
 * warm orange reserved for warnings. All canvas UI reads these values.
 */
export const THEME = {
  bg: 'rgba(8, 15, 26, 0.92)',
  bgSolid: '#0a1220',
  panelBorder: 'rgba(111, 230, 255, 0.55)',
  primary: '#6fe6ff',
  primaryDim: 'rgba(111, 230, 255, 0.35)',
  accent: '#9a7bff',
  text: 'rgba(235, 250, 255, 0.98)',
  textDim: 'rgba(160, 196, 216, 0.9)',
  textFaint: 'rgba(150, 170, 190, 0.7)',
  warning: '#ffa23a',
  danger: '#ff5c5c',
  success: '#7dffa8',
  disabled: 'rgba(120, 140, 160, 0.45)',
  hoverGlow: 'rgba(111, 230, 255, 0.28)',
  pressedShade: 'rgba(111, 230, 255, 0.45)',

  fontFamily: 'system-ui, sans-serif',
  titlePx: 46,
  headingPx: 34,
  bodyPx: 30,
  buttonPx: 32,
  smallPx: 24,
  tinyPx: 20,

  radiusPx: 18,
  spacingPx: 16,
  buttonHPx: 68,
  buttonGapPx: 20,
  hitPadPx: 14,
} as const;
