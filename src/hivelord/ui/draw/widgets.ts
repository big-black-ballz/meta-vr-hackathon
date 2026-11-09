import { THEME, mix, withAlpha } from '../theme.js';
import type { Control } from '../controls.js';
import { drawWarnTriangle, drawChevron } from './icons.js';
import { roundRectPath } from './panel.js';

export type ButtonVariant = 'primary' | 'secondary' | 'destructive';

/**
 * Button hierarchy. Primary CTA (one per screen): solid primary, dark text,
 * no outline. Secondary: raised fill, gold outline, light text. Destructive:
 * raised fill, danger outline, warning triangle, light text. Disabled: panel
 * fill, locked outline, faint text, no hover/press response. Press adds a
 * 0.97 scale plus a ~2 px depress; primary darkens via mix() below.
 */
export function drawButton(
  ctx: CanvasRenderingContext2D,
  c: Control,
  variant: ButtonVariant,
): void {
  const disabled = !c.enabled;
  const v: ButtonVariant = disabled ? 'secondary' : variant;
  ctx.save();
  if (c.pressed && !disabled) {
    ctx.translate(c.x + c.w / 2, c.y + c.h / 2 + 2);
    ctx.scale(0.97, 0.97);
    ctx.translate(-(c.x + c.w / 2), -(c.y + c.h / 2));
  }
  if (v === 'primary') {
    ctx.fillStyle = c.pressed
      ? mix(THEME.primary, THEME.base, 0.15)
      : THEME.primary;
    roundRectPath(ctx, c.x, c.y, c.w, c.h, 14);
    ctx.fill();
    if (c.hover && !c.pressed) {
      ctx.strokeStyle = withAlpha(THEME.primary, 1);
      ctx.lineWidth = 3;
      roundRectPath(ctx, c.x, c.y, c.w, c.h, 14);
      ctx.stroke();
    }
    ctx.fillStyle = THEME.textOnPrimary;
  } else {
    const danger = v === 'destructive';
    if (disabled) {
      ctx.fillStyle = withAlpha(THEME.panel, THEME.panelOpacity);
    } else if (c.pressed) {
      ctx.fillStyle = withAlpha(THEME.primary, 0.34);
    } else if (c.hover) {
      ctx.fillStyle = withAlpha(THEME.primary, 0.18);
    } else {
      ctx.fillStyle = THEME.panelRaised;
    }
    roundRectPath(ctx, c.x, c.y, c.w, c.h, 14);
    ctx.fill();
    ctx.strokeStyle = disabled
      ? THEME.locked
      : danger
        ? THEME.danger
        : c.hover || c.pressed
          ? withAlpha(THEME.primary, 1)
          : withAlpha(THEME.primary, 0.6);
    ctx.lineWidth = 2;
    roundRectPath(ctx, c.x, c.y, c.w, c.h, 14);
    ctx.stroke();
    ctx.fillStyle = disabled ? THEME.textFaint : THEME.text;
  }
  if (v === 'destructive' && !disabled) {
    drawWarnTriangle(ctx, c.x + 34, c.y + c.h / 2, 30, THEME.warning);
  }
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `600 ${THEME.buttonPx}px ${THEME.fontFamily}`;
  const textX =
    v === 'destructive' && !disabled ? c.x + c.w / 2 + 14 : c.x + c.w / 2;
  ctx.fillText(c.text, textX, c.y + c.h / 2);
  ctx.restore();
}

/** Toggle: ON = primary track + dark knob; OFF = locked track + muted knob. */
export function drawToggleControl(ctx: CanvasRenderingContext2D, c: Control): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.enabled ? THEME.text : THEME.textFaint;
  ctx.font = `500 ${THEME.bodyPx}px ${THEME.fontFamily}`;
  ctx.fillText(c.text, c.x, c.y + c.h / 2);
  const sw = 96;
  const sx = c.x + c.w - sw;
  const sy = c.y + c.h / 2 - 24;
  const on = c.value === true;
  if (c.hover && c.enabled) {
    ctx.fillStyle = withAlpha(THEME.primary, 0.18);
    roundRectPath(ctx, sx - 8, sy - 8, sw + 16, 64, 30);
    ctx.fill();
  }
  ctx.fillStyle = on ? THEME.primary : THEME.locked;
  roundRectPath(ctx, sx, sy, sw, 48, 24);
  ctx.fill();
  ctx.fillStyle = on ? THEME.textOnPrimary : THEME.textMuted;
  ctx.beginPath();
  ctx.arc(on ? sx + sw - 26 : sx + 26, sy + 24, 18, 0, Math.PI * 2);
  ctx.fill();
}

/** Stepper: gold chevrons, value in text, locked when disabled. */
export function drawStepperControl(
  ctx: CanvasRenderingContext2D,
  c: Control,
): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.enabled ? THEME.text : THEME.textFaint;
  ctx.font = `500 ${THEME.bodyPx}px ${THEME.fontFamily}`;
  ctx.fillText(c.text, c.x, c.y + c.h / 2);
  ctx.textAlign = 'center';
  const bw = 76;
  const vy = c.y + c.h / 2;
  const leftX = c.x + c.w - bw * 2 - 190;
  const rightX = c.x + c.w - bw;
  const arrow = c.enabled ? THEME.primary : THEME.locked;
  if (c.hover && c.enabled) {
    ctx.fillStyle = withAlpha(THEME.primary, 0.18);
    roundRectPath(ctx, leftX, vy - 30, bw, 60, 12);
    ctx.fill();
    roundRectPath(ctx, rightX, vy - 30, bw, 60, 12);
    ctx.fill();
  }
  drawChevron(ctx, leftX + bw / 2, vy, 44, -1, arrow);
  drawChevron(ctx, rightX + bw / 2, vy, 44, 1, arrow);
  ctx.fillStyle = c.enabled ? THEME.text : THEME.textFaint;
  ctx.font = `600 ${THEME.buttonPx}px ${THEME.fontFamily}`;
  ctx.fillText(String(c.value), c.x + c.w - bw - 95, vy);
}

/** Pill meter: panelEdge track, primary fill. */
export function drawProgressBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  progress: number,
): void {
  ctx.fillStyle = THEME.panelEdge;
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  const p = Math.max(0, Math.min(1, progress));
  if (p > 0) {
    ctx.fillStyle = THEME.primary;
    const pw = Math.max(h, w * p);
    roundRectPath(ctx, x, y, pw, h, h / 2);
    ctx.fill();
  }
}

/** Radial meter (cooldowns, charge). Center cx,cy, radius r, 0..1 progress. */
export function drawRadial(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  progress: number,
  ready: boolean,
): void {
  ctx.strokeStyle = THEME.panelEdge;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
  const p = Math.max(0, Math.min(1, progress));
  if (p > 0) {
    ctx.strokeStyle = ready ? THEME.success : THEME.primary;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + p * Math.PI * 2);
    ctx.stroke();
  }
  if (ready) {
    ctx.fillStyle = THEME.success;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }
}
