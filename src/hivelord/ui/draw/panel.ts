import { THEME, withAlpha } from '../theme.js';
import { drawHex } from './icons.js';

export function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * Obsidian panel: panel fill at panelOpacity, 3 px primary-at-50% border,
 * inner 1 px panelEdge hairline inset 6 px, radius 18. No glow behind text.
 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  ctx.fillStyle = withAlpha(THEME.panel, THEME.panelOpacity);
  roundRectPath(ctx, 4, 4, w - 8, h - 8, THEME.radiusPx);
  ctx.fill();
  ctx.strokeStyle = withAlpha(THEME.primary, 0.5);
  ctx.lineWidth = 3;
  roundRectPath(ctx, 4, 4, w - 8, h - 8, THEME.radiusPx);
  ctx.stroke();
  ctx.strokeStyle = THEME.panelEdge;
  ctx.lineWidth = 1;
  roundRectPath(ctx, 10, 10, w - 20, h - 20, THEME.radiusPx - 6);
  ctx.stroke();
}

/**
 * Panel title in primary with a 2 px primary-at-40% divider and a small
 * centered hexagon. Set glow=true for the Start title (soft gold glow,
 * drawn only on dirty-gated redraws).
 */
export function drawTitle(
  ctx: CanvasRenderingContext2D,
  w: number,
  title: string,
  glow: boolean,
  titleY = 52,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${THEME.titlePx}px ${THEME.fontFamily}`;
  if (glow) {
    ctx.save();
    ctx.shadowColor = withAlpha(THEME.primary, 0.35);
    ctx.shadowBlur = 24;
    ctx.fillStyle = THEME.primary;
    ctx.fillText(title, w / 2, titleY);
    ctx.restore();
  } else {
    ctx.fillStyle = THEME.primary;
    ctx.fillText(title, w / 2, titleY);
  }
  const y = titleY + 40;
  ctx.strokeStyle = withAlpha(THEME.primary, 0.4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, y);
  ctx.lineTo(w / 2 - 26, y);
  ctx.moveTo(w / 2 + 26, y);
  ctx.lineTo(w - 48, y);
  ctx.stroke();
  drawHex(ctx, w / 2, y, 12, THEME.primary, null, 2);
}
