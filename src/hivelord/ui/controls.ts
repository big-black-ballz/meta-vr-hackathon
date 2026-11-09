import { THEME } from './theme.js';

export type ControlKind =
  | 'button'
  | 'toggle'
  | 'stepper'
  | 'label'
  | 'progress'
  | 'row'
  | 'hit';

export interface Control {
  id: string;
  kind: ControlKind;
  /** Canvas pixels, y down. */
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  sub: string;
  enabled: boolean;
  /** toggle/stepper state. */
  value: string | boolean;
  options: string[];
  /** 0..1 for progress. */
  progress: number;
  hover: boolean;
  pressed: boolean;
}

export function makeControl(
  id: string,
  kind: ControlKind,
  x: number,
  y: number,
  w: number,
  h: number,
  text = '',
): Control {
  return {
    id,
    kind,
    x,
    y,
    w,
    h,
    text,
    sub: '',
    enabled: true,
    value: false,
    options: [],
    progress: 0,
    hover: false,
    pressed: false,
  };
}

export function controlAt(
  controls: Control[],
  px: number,
  py: number,
): Control | null {
  for (let i = controls.length - 1; i >= 0; i--) {
    const c = controls[i];
    if (!c.enabled || c.kind === 'label' || c.kind === 'progress' || c.kind === 'row') {
      continue;
    }
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) {
      return c;
    }
  }
  return null;
}

function roundRect(
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

export function drawChrome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
): void {
  ctx.fillStyle = THEME.bg;
  roundRect(ctx, 4, 4, w - 8, h - 8, THEME.radiusPx);
  ctx.fill();
  ctx.strokeStyle = THEME.panelBorder;
  ctx.lineWidth = 3;
  roundRect(ctx, 4, 4, w - 8, h - 8, THEME.radiusPx);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = THEME.text;
  ctx.font = `700 ${THEME.titlePx}px ${THEME.fontFamily}`;
  ctx.fillText(title, w / 2, 52);
}

function controlFill(c: Control): string {
  if (!c.enabled) {
    return 'rgba(40, 55, 75, 0.6)';
  }
  if (c.pressed) {
    return THEME.pressedShade;
  }
  if (c.hover) {
    return THEME.hoverGlow;
  }
  return 'rgba(30, 50, 75, 0.85)';
}

export function drawControl(ctx: CanvasRenderingContext2D, c: Control): void {
  if (c.kind === 'hit') {
    return;
  }
  switch (c.kind) {
    case 'label': {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.textDim;
      ctx.font = `500 ${THEME.bodyPx}px ${THEME.fontFamily}`;
      ctx.fillText(c.text, c.x + c.w / 2, c.y + c.h / 2);
      break;
    }
    case 'button': {
      ctx.fillStyle = controlFill(c);
      roundRect(ctx, c.x, c.y, c.w, c.h, 14);
      ctx.fill();
      ctx.strokeStyle = c.enabled ? THEME.primaryDim : THEME.disabled;
      ctx.lineWidth = 2;
      roundRect(ctx, c.x, c.y, c.w, c.h, 14);
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.enabled ? THEME.text : THEME.disabled;
      ctx.font = `600 ${THEME.buttonPx}px ${THEME.fontFamily}`;
      ctx.fillText(c.text, c.x + c.w / 2, c.y + c.h / 2);
      break;
    }
    case 'toggle': {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.enabled ? THEME.text : THEME.disabled;
      ctx.font = `500 ${THEME.bodyPx}px ${THEME.fontFamily}`;
      ctx.fillText(c.text, c.x, c.y + c.h / 2);
      const sw = 96;
      const sx = c.x + c.w - sw;
      const sy = c.y + c.h / 2 - 24;
      const on = c.value === true;
      ctx.fillStyle = on ? THEME.primaryDim : 'rgba(60, 75, 95, 0.8)';
      roundRect(ctx, sx, sy, sw, 48, 24);
      ctx.fill();
      ctx.fillStyle = on ? THEME.primary : THEME.textFaint;
      ctx.beginPath();
      ctx.arc(on ? sx + sw - 26 : sx + 26, sy + 24, 18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'stepper': {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.text;
      ctx.font = `500 ${THEME.bodyPx}px ${THEME.fontFamily}`;
      ctx.fillText(c.text, c.x, c.y + c.h / 2);
      ctx.textAlign = 'center';
      const bw = 76;
      const vy = c.y + c.h / 2;
      ctx.fillStyle = controlFill(c);
      roundRect(ctx, c.x + c.w - bw * 2 - 190, vy - 30, bw, 60, 12);
      ctx.fill();
      roundRect(ctx, c.x + c.w - bw, vy - 30, bw, 60, 12);
      ctx.fill();
      ctx.fillStyle = THEME.text;
      ctx.font = `600 ${THEME.buttonPx}px ${THEME.fontFamily}`;
      ctx.fillText('<', c.x + c.w - bw * 2 - 190 + bw / 2, vy);
      ctx.fillText('>', c.x + c.w - bw + bw / 2, vy);
      ctx.fillStyle = THEME.primary;
      ctx.fillText(
        String(c.value),
        c.x + c.w - bw - 95,
        vy,
      );
      break;
    }
    case 'progress': {
      ctx.fillStyle = 'rgba(60, 75, 95, 0.8)';
      roundRect(ctx, c.x, c.y, c.w, c.h, c.h / 2);
      ctx.fill();
      ctx.fillStyle = THEME.primary;
      const pw = Math.max(c.h, c.w * Math.max(0, Math.min(1, c.progress)));
      roundRect(ctx, c.x, c.y, pw, c.h, c.h / 2);
      ctx.fill();
      break;
    }
    case 'row': {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.enabled ? THEME.text : THEME.disabled;
      ctx.font = `600 ${THEME.bodyPx}px ${THEME.fontFamily}`;
      ctx.fillText(c.text, c.x, c.y + 24);
      ctx.fillStyle = THEME.textDim;
      ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
      ctx.fillText(c.sub, c.x, c.y + c.h - 22);
      break;
    }
    default:
      break;
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
  ctx.strokeStyle = 'rgba(60, 75, 95, 0.9)';
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
