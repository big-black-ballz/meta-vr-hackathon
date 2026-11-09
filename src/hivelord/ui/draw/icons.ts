import { THEME, withAlpha } from '../theme.js';

/**
 * Stroked icon set for canvas UI. All paths are immediate-mode (no retained
 * objects); panels redraw only when dirty, so there is no per-frame cost.
 * Locked states pair these icons with muted text, never color alone.
 */

export function strokeIcon(
  ctx: CanvasRenderingContext2D,
  color: string,
  width: number,
): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

/** Hive hexagon outline centered at cx,cy with circumradius r. */
export function drawHex(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  stroke: string,
  fill: string | null,
  lineWidth: number,
): void {
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (Math.PI / 3) * i - Math.PI / 6;
    const x = cx + r * Math.cos(a);
    const y = cy + r * Math.sin(a);
    if (i === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  }
  ctx.closePath();
  if (fill != null) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  strokeIcon(ctx, stroke, lineWidth);
  ctx.stroke();
}

export function drawCheck(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.45, cy + size * 0.02);
  ctx.lineTo(cx - size * 0.1, cy + size * 0.38);
  ctx.lineTo(cx + size * 0.5, cy - size * 0.34);
  strokeIcon(ctx, color, Math.max(2, size * 0.16));
  ctx.stroke();
}

export function drawWarnTriangle(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.55);
  ctx.lineTo(cx + size * 0.55, cy + size * 0.4);
  ctx.lineTo(cx - size * 0.55, cy + size * 0.4);
  ctx.closePath();
  strokeIcon(ctx, color, Math.max(2, size * 0.14));
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(cx - 1.5, cy - size * 0.18, 3, size * 0.32);
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.26, 2.2, 0, Math.PI * 2);
  ctx.fill();
}

export function drawLock(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const w = size * 0.72;
  const h = size * 0.55;
  strokeIcon(ctx, color, Math.max(2, size * 0.13));
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.08, size * 0.26, Math.PI, 0);
  ctx.stroke();
  ctx.strokeRect(cx - w / 2, cy - size * 0.08, w, h);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.16, 2.4, 0, Math.PI * 2);
  ctx.fill();
}

export function drawX(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.35, cy - size * 0.35);
  ctx.lineTo(cx + size * 0.35, cy + size * 0.35);
  ctx.moveTo(cx + size * 0.35, cy - size * 0.35);
  ctx.lineTo(cx - size * 0.35, cy + size * 0.35);
  strokeIcon(ctx, color, Math.max(2, size * 0.16));
  ctx.stroke();
}

export function drawChevron(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  dir: 1 | -1,
  color: string,
): void {
  ctx.beginPath();
  ctx.moveTo(cx - dir * size * 0.3, cy - size * 0.42);
  ctx.lineTo(cx + dir * size * 0.3, cy);
  ctx.lineTo(cx - dir * size * 0.3, cy + size * 0.42);
  strokeIcon(ctx, color, Math.max(2, size * 0.16));
  ctx.stroke();
}

export function drawInfo(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.5, 0, Math.PI * 2);
  strokeIcon(ctx, color, Math.max(2, size * 0.13));
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.18, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(cx - 1.5, cy - size * 0.05, 3, size * 0.3);
}

export { THEME, withAlpha };
