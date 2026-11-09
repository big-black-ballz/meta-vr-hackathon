/**
 * Obsidian Gold theme: single source of truth for every Hivelord UI color.
 *
 * Obsidian panels, restrained gold for interaction, violet for story/magic,
 * warm orange for warnings only, red for stun/destructive only, green for
 * ready/success only. No hard-coded UI colors may live outside this file
 * (see scripts/ui-color-allowlist.json for the documented exclusions).
 *
 * Derived alpha variants are functions (withAlpha), never duplicated hex.
 * This module is dependency-free so starter systems (room-scan) can read
 * tokens without pulling in UI logic.
 */

/** Mid-grey room backdrop used by the contrast checker. */
export const CONTRAST_BACKDROP = '#808080';

export interface ThemeTokens {
  base: string;
  panel: string;
  panelTop: string;
  panelBottom: string;
  panelRaised: string;
  panelEdge: string;
  primary: string;
  accent: string;
  accentText: string;
  text: string;
  textMuted: string;
  textFaint: string;
  locked: string;
  success: string;
  warning: string;
  danger: string;
  textOnPrimary: string;
  panelOpacity: number;
  highContrast: boolean;
  fontFamily: string;
  titlePx: number;
  headingPx: number;
  bodyPx: number;
  buttonPx: number;
  smallPx: number;
  tinyPx: number;
  radiusPx: number;
  spacingPx: number;
  buttonHPx: number;
  buttonGapPx: number;
  hitPadPx: number;
}

const BASE_TOKENS: ThemeTokens = {
  base: '#0A0908',
  panel: '#1A1612',
  panelTop: '#1F1A14',
  panelBottom: '#14110D',
  panelRaised: '#231D16',
  panelEdge: '#3A3126',
  primary: '#F5C451',
  accent: '#7A5CFF',
  accentText: '#9D86FF',
  text: '#F7F1E5',
  textMuted: '#B0A58F',
  textFaint: '#9C917A',
  locked: '#4F473A',
  success: '#6BE08A',
  warning: '#FF7A45',
  danger: '#FF4D5A',
  textOnPrimary: '#0A0908',
  panelOpacity: 0.88,
  highContrast: false,
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
};

/** Working theme. Mutated only by setPanelOpacity/setHighContrast. */
export const THEME: ThemeTokens = { ...BASE_TOKENS };

export function setPanelOpacity(v: number): void {
  THEME.panelOpacity = Math.max(0.5, Math.min(1, v));
}

export function setHighContrast(on: boolean): void {
  THEME.highContrast = on;
  if (on) {
    THEME.panelOpacity = 0.97;
    THEME.textMuted = BASE_TOKENS.text;
    THEME.panelEdge = mix(BASE_TOKENS.panelEdge, BASE_TOKENS.primary, 0.35);
  } else {
    THEME.panelOpacity = BASE_TOKENS.panelOpacity;
    THEME.textMuted = BASE_TOKENS.textMuted;
    THEME.panelEdge = BASE_TOKENS.panelEdge;
  }
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function parseHex(color: string): RGB {
  let hex = color.startsWith('#') ? color.slice(1) : color;
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const n = parseInt(hex, 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function toHex(r: number, g: number, b: number): string {
  const h = (v: number): string =>
    Math.max(0, Math.min(255, Math.round(v)))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

/** Hex color + alpha as an rgba() string for canvas/DOM use. */
export function withAlpha(color: string, a: number): string {
  const { r, g, b } = parseHex(color);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** Linear interpolation between two hex colors; t=0 gives a, t=1 gives b. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  const k = Math.max(0, Math.min(1, t));
  return toHex(
    ca.r + (cb.r - ca.r) * k,
    ca.g + (cb.g - ca.g) * k,
    ca.b + (cb.b - ca.b) * k,
  );
}

/** Opaque result of drawing fg at alpha over an opaque bg. */
export function blendOver(fg: string, alpha: number, bg: string): string {
  const c = parseHex(fg);
  const d = parseHex(bg);
  const a = Math.max(0, Math.min(1, alpha));
  return toHex(
    c.r * a + d.r * (1 - a),
    c.g * a + d.g * (1 - a),
    c.b * a + d.b * (1 - a),
  );
}

function luminance(color: string): number {
  const { r, g, b } = parseHex(color);
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

/** WCAG contrast ratio between two opaque hex colors. */
export function contrastRatio(fg: string, bg: string): number {
  const l1 = luminance(fg);
  const l2 = luminance(bg);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

const CSS_VARS: Array<[string, keyof ThemeTokens]> = [
  ['--hiv-base', 'base'],
  ['--hiv-panel', 'panel'],
  ['--hiv-panel-top', 'panelTop'],
  ['--hiv-panel-bottom', 'panelBottom'],
  ['--hiv-panel-raised', 'panelRaised'],
  ['--hiv-panel-edge', 'panelEdge'],
  ['--hiv-primary', 'primary'],
  ['--hiv-accent', 'accent'],
  ['--hiv-accent-text', 'accentText'],
  ['--hiv-text', 'text'],
  ['--hiv-text-muted', 'textMuted'],
  ['--hiv-text-faint', 'textFaint'],
  ['--hiv-locked', 'locked'],
  ['--hiv-success', 'success'],
  ['--hiv-warning', 'warning'],
  ['--hiv-danger', 'danger'],
  ['--hiv-text-on-primary', 'textOnPrimary'],
];

/** Emits all tokens as CSS variables so DOM and canvas read the same source. */
export function themeToCss(): string {
  let out = ':root{';
  for (const [name, key] of CSS_VARS) {
    out += `${name}:${THEME[key]};`;
  }
  out += `--hiv-primary-glow:${withAlpha(THEME.primary, 0.16)};`;
  out += '}';
  return out;
}
