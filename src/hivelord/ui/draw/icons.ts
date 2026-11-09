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

/** Builds the hexagon path without stroking or filling. */
export function hexPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
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
  hexPath(ctx, cx, cy, r);
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

export function drawCrown(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const w = size * 0.5;
  const h = size * 0.4;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy + h);
  ctx.lineTo(cx - w, cy - h * 0.5);
  ctx.lineTo(cx - w * 0.45, cy + h * 0.05);
  ctx.lineTo(cx, cy - h);
  ctx.lineTo(cx + w * 0.45, cy + h * 0.05);
  ctx.lineTo(cx + w, cy - h * 0.5);
  ctx.lineTo(cx + w, cy + h);
  ctx.closePath();
  strokeIcon(ctx, color, Math.max(2, size * 0.11));
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.fillRect(cx - w, cy + h * 0.6, w * 2, Math.max(2, size * 0.09));
}

export function drawPause(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  ctx.fillStyle = color;
  const w = size * 0.16;
  const h = size * 0.44;
  ctx.fillRect(cx - w * 1.7, cy - h / 2, w, h);
  ctx.fillRect(cx + w * 0.7, cy - h / 2, w, h);
}

export function drawSpeaker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.7, cy - s * 0.25);
  ctx.lineTo(cx - s * 0.3, cy - s * 0.25);
  ctx.lineTo(cx + s * 0.15, cy - s * 0.65);
  ctx.lineTo(cx + s * 0.15, cy + s * 0.65);
  ctx.lineTo(cx - s * 0.3, cy + s * 0.25);
  ctx.lineTo(cx - s * 0.7, cy + s * 0.25);
  ctx.closePath();
  strokeIcon(ctx, color, Math.max(2, size * 0.1));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + s * 0.15, cy, s * 0.55, -0.9, 0.9);
  ctx.stroke();
}

export function drawTextSize(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.6, cy + s * 0.5);
  ctx.lineTo(cx - s * 0.1, cy - s * 0.65);
  ctx.lineTo(cx + s * 0.4, cy + s * 0.5);
  ctx.moveTo(cx - s * 0.42, cy + s * 0.12);
  ctx.lineTo(cx + s * 0.22, cy + s * 0.12);
  strokeIcon(ctx, color, Math.max(2, size * 0.1));
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx + s * 0.6, cy + s * 0.18, s * 0.16, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.6, cy + s * 0.34);
  ctx.lineTo(cx + s * 0.6, cy + s * 0.5);
  ctx.stroke();
}

export function drawHandIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size * 0.5;
  strokeIcon(ctx, color, Math.max(2, size * 0.09));
  ctx.beginPath();
  ctx.roundRect(cx - s * 0.45, cy - s * 0.1, s * 0.9, s * 0.75, s * 0.18);
  ctx.stroke();
  for (let i = 0; i < 4; i++) {
    const x = cx - s * 0.45 + i * s * 0.27;
    ctx.beginPath();
    ctx.moveTo(x, cy - s * 0.1);
    ctx.lineTo(x, cy - s * 0.55 + (i === 0 || i === 3 ? s * 0.12 : 0));
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.45, cy + s * 0.2);
  ctx.lineTo(cx - s * 0.75, cy + s * 0.05);
  ctx.stroke();
}

export function drawGauge(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const r = size * 0.42;
  strokeIcon(ctx, color, Math.max(2, size * 0.1));
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.1, r, Math.PI, 0);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.1);
  ctx.lineTo(cx + r * 0.55, cy - r * 0.35);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + size * 0.1, size * 0.06, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawEye(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size * 0.5;
  strokeIcon(ctx, color, Math.max(2, size * 0.1));
  ctx.beginPath();
  ctx.moveTo(cx - s * 0.85, cy);
  ctx.quadraticCurveTo(cx, cy - s * 0.75, cx + s * 0.85, cy);
  ctx.quadraticCurveTo(cx, cy + s * 0.75, cx - s * 0.85, cy);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, s * 0.28, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

export function drawShieldIcon(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size * 0.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s * 0.75);
  ctx.lineTo(cx + s * 0.7, cy - s * 0.45);
  ctx.lineTo(cx + s * 0.55, cy + s * 0.35);
  ctx.lineTo(cx, cy + s * 0.8);
  ctx.lineTo(cx - s * 0.55, cy + s * 0.35);
  ctx.lineTo(cx - s * 0.7, cy - s * 0.45);
  ctx.closePath();
  strokeIcon(ctx, color, Math.max(2, size * 0.1));
  ctx.stroke();
}

export function drawBackArrow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  const s = size * 0.5;
  strokeIcon(ctx, color, Math.max(2, size * 0.12));
  ctx.beginPath();
  ctx.moveTo(cx + s * 0.55, cy);
  ctx.lineTo(cx - s * 0.55, cy);
  ctx.moveTo(cx - s * 0.2, cy - s * 0.35);
  ctx.lineTo(cx - s * 0.55, cy);
  ctx.lineTo(cx - s * 0.2, cy + s * 0.35);
  ctx.stroke();
}

export function drawPlus(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  strokeIcon(ctx, color, Math.max(2, size * 0.14));
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.3, cy);
  ctx.lineTo(cx + size * 0.3, cy);
  ctx.moveTo(cx, cy - size * 0.3);
  ctx.lineTo(cx, cy + size * 0.3);
  ctx.stroke();
}

export function drawMinus(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  strokeIcon(ctx, color, Math.max(2, size * 0.14));
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.3, cy);
  ctx.lineTo(cx + size * 0.3, cy);
  ctx.stroke();
}

export type AbilityGlyph =
  | 'pinch'
  | 'fist'
  | 'wall'
  | 'scout'
  | 'shield'
  | 'grab';export function drawAbilityGlyph(
  ctx: CanvasRenderingContext2D,
  kind: AbilityGlyph,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  switch (kind) {
    case 'pinch': {
      const s = size * 0.5;
      strokeIcon(ctx, color, Math.max(2, size * 0.1));
      ctx.beginPath();
      ctx.arc(cx - s * 0.35, cy - s * 0.4, s * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(cx + s * 0.35, cy + s * 0.4, s * 0.22, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(cx - s * 0.18, cy - s * 0.25);
      ctx.lineTo(cx + s * 0.18, cy + s * 0.25);
      ctx.stroke();
      break;
    }
    case 'fist': {
      const s = size * 0.5;
      strokeIcon(ctx, color, Math.max(2, size * 0.1));
      ctx.beginPath();
      ctx.roundRect(cx - s * 0.6, cy - s * 0.35, s * 1.2, s * 0.9, s * 0.22);
      ctx.stroke();
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(cx - s * 0.4 + i * s * 0.4, cy - s * 0.35);
        ctx.lineTo(cx - s * 0.4 + i * s * 0.4, cy + s * 0.1);
        ctx.stroke();
      }
      break;
    }
    case 'wall': {
      const s = size * 0.5;
      strokeIcon(ctx, color, Math.max(2, size * 0.09));
      for (let row = 0; row < 3; row++) {
        const off = row % 2 === 0 ? 0 : s * 0.28;
        for (let col = 0; col < 2; col++) {
          ctx.strokeRect(cx - s * 0.7 + off + col * s * 0.6, cy - s * 0.6 + row * s * 0.42, s * 0.56, s * 0.38);
        }
      }
      break;
    }
    case 'scout':
      drawEye(ctx, cx, cy, size, color);
      break;
    case 'shield':
      drawShieldIcon(ctx, cx, cy, size, color);
      break;
    case 'grab':
      drawHandIcon(ctx, cx, cy, size, color);
      break;
    default:
      break;
  }
}

export type NamedIcon =
  | 'none'
  | 'speaker'
  | 'text'
  | 'hand'
  | 'gauge'
  | 'eye'
  | 'shield'
  | 'back'
  | 'plus'
  | 'minus'
  | 'crown'
  | 'pause'
  | 'warning'
  | 'hex'
  | 'info'
  | 'check'
  | 'lock';

export function drawNamedIcon(
  ctx: CanvasRenderingContext2D,
  name: NamedIcon,
  cx: number,
  cy: number,
  size: number,
  color: string,
): void {
  switch (name) {
    case 'speaker':
      drawSpeaker(ctx, cx, cy, size, color);
      break;
    case 'text':
      drawTextSize(ctx, cx, cy, size, color);
      break;
    case 'hand':
      drawHandIcon(ctx, cx, cy, size, color);
      break;
    case 'gauge':
      drawGauge(ctx, cx, cy, size, color);
      break;
    case 'eye':
      drawEye(ctx, cx, cy, size, color);
      break;
    case 'shield':
      drawShieldIcon(ctx, cx, cy, size, color);
      break;
    case 'back':
      drawBackArrow(ctx, cx, cy, size, color);
      break;
    case 'plus':
      drawPlus(ctx, cx, cy, size, color);
      break;
    case 'minus':
      drawMinus(ctx, cx, cy, size, color);
      break;
    case 'crown':
      drawCrown(ctx, cx, cy, size, color);
      break;
    case 'pause':
      drawPause(ctx, cx, cy, size, color);
      break;
    case 'warning':
      drawWarnTriangle(ctx, cx, cy, size, color);
      break;
    case 'hex':
      drawHex(ctx, cx, cy, size * 0.5, color, null, 2);
      break;
    case 'info':
      drawInfo(ctx, cx, cy, size, color);
      break;
    case 'check':
      drawCheck(ctx, cx, cy, size, color);
      break;
    case 'lock':
      drawLock(ctx, cx, cy, size, color);
      break;
    default:
      break;
  }
}

export { THEME, withAlpha };
