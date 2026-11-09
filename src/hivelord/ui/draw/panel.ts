import { THEME, withAlpha } from '../theme.js';
import { drawCrown, drawHex, drawPause, drawWarnTriangle } from './icons.js';

const BRACKET = 28;
const WATERMARK_HEX = 34;

let watermark: CanvasPattern | null = null;

function getWatermark(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (watermark != null) {
    return watermark;
  }
  const c = document.createElement('canvas');
  c.width = WATERMARK_HEX * 3;
  c.height = WATERMARK_HEX * 3;
  const g = c.getContext('2d');
  if (g == null) {
    return null;
  }
  g.strokeStyle = THEME.primary;
  g.lineWidth = 1.5;
  for (let row = 0; row < 2; row++) {
    for (let col = 0; col < 3; col++) {
      const cx = col * WATERMARK_HEX + (row % 2 === 0 ? 0 : WATERMARK_HEX / 2);
      const cy = row * WATERMARK_HEX * 0.85;
      g.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i - Math.PI / 6;
        const x = cx + WATERMARK_HEX * 0.42 * Math.cos(a);
        const y = cy + WATERMARK_HEX * 0.42 * Math.sin(a);
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.stroke();
    }
  }
  watermark = ctx.createPattern(c, 'repeat');
  return watermark;
}

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

function cornerBrackets(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const inset = 13;
  const arm = BRACKET;
  ctx.strokeStyle = withAlpha(THEME.primary, 0.78);
  ctx.lineWidth = 2;
  ctx.lineCap = 'square';
  const corners = [
    [inset, inset, 1, 1],
    [w - inset, inset, -1, 1],
    [inset, h - inset, 1, -1],
    [w - inset, h - inset, -1, -1],
  ];
  for (const [x, y, sx, sy] of corners) {
    ctx.beginPath();
    ctx.moveTo(x + sx * arm, y);
    ctx.lineTo(x, y);
    ctx.lineTo(x, y + sy * arm);
    ctx.stroke();
  }
  // Small inner filigree dot at each bracket corner.
  ctx.fillStyle = withAlpha(THEME.primary, 0.55);
  for (const [x, y] of corners) {
    ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
  }
}

/**
 * Obsidian panel body: vertical gradient, gold corner brackets, hex lattice
 * watermark, top highlight, inner gold glow and hairline. Drawn only on dirty
 * redraws; the watermark pattern is cached for the process lifetime.
 */
export function drawPanel(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
): void {
  const gradient = ctx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, withAlpha(THEME.panelTop, THEME.panelOpacity));
  gradient.addColorStop(1, withAlpha(THEME.panelBottom, THEME.panelOpacity));
  ctx.fillStyle = gradient;
  roundRectPath(ctx, 4, 4, w - 8, h - 8, THEME.radiusPx);
  ctx.fill();

  const pattern = getWatermark(ctx);
  if (pattern != null) {
    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.fillStyle = pattern;
    roundRectPath(ctx, 4, 4, w - 8, h - 8, THEME.radiusPx);
    ctx.fill();
    ctx.restore();
  }

  // Soft inner glow along the border (no glow behind body text).
  ctx.save();
  ctx.shadowColor = withAlpha(THEME.primary, 0.12);
  ctx.shadowBlur = 10;
  ctx.strokeStyle = withAlpha(THEME.primary, 0.5);
  ctx.lineWidth = 3;
  roundRectPath(ctx, 4, 4, w - 8, h - 8, THEME.radiusPx);
  ctx.stroke();
  ctx.restore();

  // Top-edge highlight.
  ctx.strokeStyle = withAlpha(THEME.primary, 0.25);
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(26, 6);
  ctx.lineTo(w - 26, 6);
  ctx.stroke();

  // Inner hairline.
  ctx.strokeStyle = THEME.panelEdge;
  ctx.lineWidth = 1;
  roundRectPath(ctx, 10, 10, w - 20, h - 20, THEME.radiusPx - 6);
  ctx.stroke();

  cornerBrackets(ctx, w, h);
}

export type TitleIcon = 'none' | 'crown' | 'pause' | 'warning' | 'hex';

function drawTitleIcon(
  ctx: CanvasRenderingContext2D,
  icon: TitleIcon,
  x: number,
  y: number,
): void {
  switch (icon) {
    case 'crown':
      drawCrown(ctx, x, y, 30, THEME.primary);
      break;
    case 'pause':
      drawPause(ctx, x, y, 28, THEME.textMuted);
      break;
    case 'warning':
      drawWarnTriangle(ctx, x, y, 28, THEME.warning);
      break;
    case 'hex':
      drawHex(ctx, x, y, 15, THEME.primary, null, 2);
      break;
    default:
      break;
  }
}

/**
 * Title with optional icon, subtitle, faint glow, flanking gold lines and
 * small hexagon terminations. Glow is static (dirty-gated redraw).
 */
export function drawTitle(
  ctx: CanvasRenderingContext2D,
  w: number,
  title: string,
  glow: boolean,
  titleY = 52,
  icon: TitleIcon = 'none',
  subtitle = '',
  color = THEME.primary,
  sizePx = THEME.titlePx,
): void {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${sizePx}px ${THEME.fontFamily}`;
  if (glow) {
    ctx.save();
    ctx.shadowColor = withAlpha(THEME.primary, 0.35);
    ctx.shadowBlur = 24;
    ctx.fillStyle = color;
    ctx.fillText(title, w / 2, titleY);
    ctx.restore();
  } else {
    ctx.fillStyle = color;
    ctx.fillText(title, w / 2, titleY);
  }

  if (icon !== 'none') {
    const textWidth = ctx.measureText(title).width;
    drawTitleIcon(ctx, icon, w / 2 - textWidth / 2 - 34, titleY);
  }

  if (subtitle !== '') {
    ctx.fillStyle = THEME.textMuted;
    ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
    ctx.fillText(subtitle, w / 2, titleY + 30);
  }

  const dividerY = titleY + (subtitle !== '' ? 48 : 40);
  ctx.strokeStyle = withAlpha(THEME.primary, 0.4);
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(48, dividerY);
  ctx.lineTo(w / 2 - 50, dividerY);
  ctx.moveTo(w / 2 + 50, dividerY);
  ctx.lineTo(w - 48, dividerY);
  ctx.stroke();
  drawHex(ctx, w / 2 - 32, dividerY, 9, THEME.primary, null, 1.5);
  drawHex(ctx, w / 2 + 32, dividerY, 9, THEME.primary, null, 1.5);
  drawHex(ctx, w / 2, dividerY, 12, THEME.primary, null, 2);
}
