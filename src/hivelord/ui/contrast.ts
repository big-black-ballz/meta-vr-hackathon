import {
  CONTRAST_BACKDROP,
  THEME,
  blendOver,
  contrastRatio,
} from './theme.js';

interface Pair {
  label: string;
  fg: string;
  bg: string;
  sizePx: number;
}

/**
 * Dev-only contrast table. Panel colors are composited over a mid-grey room
 * backdrop at the current panelOpacity, which is the worst realistic case
 * for text drawn on a translucent obsidian panel.
 */
export function runContrastCheck(): { failures: number; lines: string[] } {
  const backdrop = CONTRAST_BACKDROP;
  const panelBg = blendOver(THEME.panel, THEME.panelOpacity, backdrop);
  const raisedBg = blendOver(THEME.panelRaised, 1, backdrop);
  const pairs: Pair[] = [
    { label: 'text/panel', fg: THEME.text, bg: panelBg, sizePx: 30 },
    { label: 'textMuted/panel', fg: THEME.textMuted, bg: panelBg, sizePx: 30 },
    { label: 'textFaint/panel', fg: THEME.textFaint, bg: panelBg, sizePx: 24 },
    { label: 'primary/panel', fg: THEME.primary, bg: panelBg, sizePx: 46 },
    { label: 'accentText/panel', fg: THEME.accentText, bg: panelBg, sizePx: 24 },
    { label: 'warning/panel', fg: THEME.warning, bg: panelBg, sizePx: 32 },
    { label: 'success/panel', fg: THEME.success, bg: panelBg, sizePx: 24 },
    { label: 'danger/panel', fg: THEME.danger, bg: panelBg, sizePx: 24 },
    { label: 'textOnPrimary/primary', fg: THEME.textOnPrimary, bg: THEME.primary, sizePx: 32 },
    { label: 'text/panelRaised', fg: THEME.text, bg: raisedBg, sizePx: 30 },
    { label: 'textMuted/panelRaised', fg: THEME.textMuted, bg: raisedBg, sizePx: 30 },
    { label: 'textFaint/panelRaised', fg: THEME.textFaint, bg: raisedBg, sizePx: 24 },
  ];
  const lines: string[] = [];
  let failures = 0;
  lines.push(
    `contrast check (panel #${THEME.panel.slice(1)} at ${Math.round(
      THEME.panelOpacity * 100,
    )}% over ${backdrop})`,
  );
  for (const pair of pairs) {
    const ratio = contrastRatio(pair.fg, pair.bg);
    const threshold = pair.sizePx < 30 ? 4.5 : 3;
    const ok = ratio >= threshold;
    if (!ok) {
      failures++;
    }
    lines.push(
      `${ok ? 'PASS' : 'FAIL'} ${pair.label} ${ratio.toFixed(2)}:1 (min ${threshold}:1, ${pair.sizePx}px)`,
    );
  }
  lines.push(`failures: ${failures}`);
  console.info(`[Hivelord] UI ${lines.join(' | ')}`);
  return { failures, lines };
}
