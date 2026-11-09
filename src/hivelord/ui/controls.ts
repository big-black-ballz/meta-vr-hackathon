import { THEME, withAlpha } from './theme.js';
import { STRINGS } from './strings.js';
import { drawPanel, drawTitle, roundRectPath } from './draw/panel.js';import {
  drawButton,
  drawProgressBar,
  type ButtonVariant,
} from './draw/widgets.js';
import {
  drawNamedIcon,
  drawPlus,
  drawMinus,
  type NamedIcon,
} from './draw/icons.js';

export type { ButtonVariant };
export { drawRadial } from './draw/widgets.js';

export type ControlKind =
  | 'button'
  | 'toggle'
  | 'stepper'
  | 'label'
  | 'progress'
  | 'row'
  | 'hit'
  | 'pips'
  | 'chips'
  | 'tab';

export interface Control {
  id: string;
  kind: ControlKind;
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  sub: string;
  desc: string;
  icon: NamedIcon | 'none';
  enabled: boolean;
  hidden: boolean;
  value: string | boolean;
  options: string[];
  progress: number;
  variant: ButtonVariant;
  defaultFocus: boolean;
  hover: boolean;
  pressed: boolean;
  anim: number;
  pop: number;
}

export function makeControl(
  id: string,
  kind: ControlKind,
  x: number,
  y: number,
  w: number,
  h: number,
  text = '',
  variant: ButtonVariant = 'secondary',
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
    desc: '',
    icon: 'none',
    enabled: true,
    hidden: false,
    value: false,
    options: [],
    progress: 0,
    variant,
    defaultFocus: false,
    hover: false,
    pressed: false,
    anim: 0,
    pop: 0,
  };
}

export function controlAt(
  controls: Control[],
  px: number,
  py: number,
): Control | null {
  for (let i = controls.length - 1; i >= 0; i--) {
    const c = controls[i];
    if (
      !c.enabled ||
      c.hidden ||
      c.kind === 'label' ||
      c.kind === 'progress' ||
      c.kind === 'row' ||
      c.kind === 'pips' ||
      c.kind === 'chips'
    ) {
      continue;
    }
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) {
      return c;
    }
  }
  return null;
}

export function drawChrome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  sizePx = THEME.titlePx,
): void {
  drawPanel(ctx, w, h);
  drawTitle(ctx, w, title, false, 52, 'none', '', THEME.primary, sizePx);
}

export function drawChromeGlow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
  sizePx = THEME.titlePx,
): void {
  drawPanel(ctx, w, h);
  drawTitle(ctx, w, title, true, 52, 'none', '', THEME.primary, sizePx);
}

/** Shared row plate with icon medallion, label and optional description. */
export function drawRowPlate(
  ctx: CanvasRenderingContext2D,
  c: Control,
): void {
  ctx.fillStyle = withAlpha(THEME.panelRaised, 0.45);
  roundRectPath(ctx, c.x, c.y, c.w, c.h, 12);
  ctx.fill();
  ctx.strokeStyle = THEME.panelEdge;
  ctx.lineWidth = 1;
  roundRectPath(ctx, c.x, c.y, c.w, c.h, 12);
  ctx.stroke();
  const icon = c.icon;
  if (icon !== 'none') {
    ctx.fillStyle = withAlpha(THEME.primary, 0.1);
    ctx.beginPath();
    ctx.arc(c.x + 34, c.y + c.h / 2, 22, 0, Math.PI * 2);
    ctx.fill();
    drawNamedIcon(
      ctx,
      icon,
      c.x + 34,
      c.y + c.h / 2,
      26,
      c.enabled ? THEME.primary : THEME.textFaint,
    );
  }
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = c.enabled ? THEME.text : THEME.textMuted;
  ctx.font = `600 ${THEME.bodyPx}px ${THEME.fontFamily}`;
  ctx.fillText(c.text, c.x + 66, c.y + (c.desc !== '' ? 30 : c.h / 2));
  if (c.desc !== '') {
    ctx.fillStyle = THEME.textMuted;
    ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
    ctx.fillText(c.desc, c.x + 66, c.y + c.h - 26);
  }
}

export function drawPips(ctx: CanvasRenderingContext2D, c: Control): void {
  drawRowPlate(ctx, c);
  const value = typeof c.value === 'string' ? Number(c.value) : 0;
  const filled = Math.round(value * 10);
  const pipsX = c.x + 300;
  const pipW = 16;
  const gap = 4;
  for (let i = 0; i < 10; i++) {
    const x = pipsX + i * (pipW + gap);
    ctx.fillStyle = i < filled ? THEME.primary : THEME.panelEdge;
    roundRectPath(ctx, x, c.y + c.h / 2 - 12, pipW, 24, 4);
    ctx.fill();
  }
  drawMinus(ctx, pipsX - 26, c.y + c.h / 2, 28, THEME.textMuted);
  drawPlus(
    ctx,
    pipsX + 10 * (pipW + gap) + 10,
    c.y + c.h / 2,
    28,
    THEME.textMuted,
  );
  const pillW = 64;
  const pillX = c.x + c.w - pillW - 14;
  ctx.fillStyle = withAlpha(THEME.panelEdge, 0.7);
  roundRectPath(ctx, pillX, c.y + c.h / 2 - 18, pillW, 36, 18);
  ctx.fill();
  ctx.fillStyle = THEME.primary;
  ctx.textAlign = 'center';
  ctx.font = `600 ${THEME.smallPx}px ${THEME.fontFamily}`;
  ctx.fillText(String(filled * 10), pillX + pillW / 2, c.y + c.h / 2);
  if (c.pop > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, c.pop);
    ctx.strokeStyle = withAlpha(THEME.primary, 0.5);
    ctx.lineWidth = 2;
    roundRectPath(ctx, pillX - 3, c.y + c.h / 2 - 21, pillW + 6, 42, 21);
    ctx.stroke();
    ctx.restore();
  }
}

export function drawChips(ctx: CanvasRenderingContext2D, c: Control): void {
  drawRowPlate(ctx, c);
  const options = c.options;
  const count = Math.max(1, options.length);
  const areaX = c.x + 300;
  const areaW = c.x + c.w - 14 - areaX;
  const gap = 6;
  const chipW = (areaW - gap * (count - 1)) / count;
  for (let i = 0; i < count; i++) {
    const option = options[i] ?? '';
    const selected = c.value === option;
    const x = areaX + i * (chipW + gap);
    const y = c.y + c.h / 2 - 28;
    ctx.fillStyle = selected ? THEME.primary : withAlpha(THEME.panelRaised, 0.9);
    roundRectPath(ctx, x, y, chipW, 56, 10);
    ctx.fill();
    ctx.strokeStyle = selected ? THEME.primary : THEME.panelEdge;
    ctx.lineWidth = selected ? 2 : 1;
    roundRectPath(ctx, x, y, chipW, 56, 10);
    ctx.stroke();
    ctx.fillStyle = selected ? THEME.textOnPrimary : THEME.textMuted;
    ctx.font = `600 ${THEME.smallPx}px ${THEME.fontFamily}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(option, x + chipW / 2, y + 28);
    if (selected && c.pop > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(1, c.pop);
      ctx.strokeStyle = withAlpha(THEME.primary, 0.8);
      ctx.lineWidth = 2;
      roundRectPath(ctx, x - 4, y - 4, chipW + 8, 64, 12);
      ctx.stroke();
      ctx.restore();
    }
  }
}

export function drawToggleRow(
  ctx: CanvasRenderingContext2D,
  c: Control,
): void {
  drawRowPlate(ctx, c);
  const on = c.value === true;
  const w = 120;
  const h = 48;
  const x = c.x + c.w - w - 16;
  const y = c.y + c.h / 2 - h / 2;
  const knobX = x + 8 + c.anim * (w - 16 - 36);
  ctx.fillStyle = on ? THEME.primary : THEME.locked;
  roundRectPath(ctx, x, y, w, h, h / 2);
  ctx.fill();
  ctx.fillStyle = on ? THEME.textOnPrimary : THEME.textMuted;
  ctx.font = `700 ${THEME.tinyPx}px ${THEME.fontFamily}`;
  ctx.textAlign = on ? 'right' : 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(on ? STRINGS.settingsOn : STRINGS.settingsOff, on ? x + w - 48 : x + 48, y + h / 2);
  ctx.fillStyle = on ? THEME.textOnPrimary : THEME.textMuted;
  ctx.beginPath();
  ctx.arc(knobX + 18, y + h / 2, 18, 0, Math.PI * 2);
  ctx.fill();
}

export function drawTab(ctx: CanvasRenderingContext2D, c: Control): void {  const active = c.value === true;
  if (active) {
    ctx.fillStyle = withAlpha(THEME.primary, 0.12);
    roundRectPath(ctx, c.x, c.y, c.w, c.h, 10);
    ctx.fill();
  }
  ctx.fillStyle = active ? THEME.primary : THEME.textMuted;
  ctx.font = `600 ${THEME.smallPx}px ${THEME.fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (c.icon !== 'none') {
    drawNamedIcon(
      ctx,
      c.icon,
      c.x + c.w / 2,
      c.y + 18,
      22,
      active ? THEME.primary : THEME.textMuted,
    );
  }
  ctx.fillText(c.text, c.x + c.w / 2, c.y + c.h - 15);
  if (active) {
    ctx.fillStyle = THEME.primary;
    ctx.fillRect(c.x + 10, c.y + c.h - 4, c.w - 20, 3);
  }
}

export function drawControl(ctx: CanvasRenderingContext2D, c: Control): void {
  if (c.hidden || c.kind === 'hit') {
    return;
  }
  switch (c.kind) {
    case 'label': {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.textMuted;
      ctx.font = `500 ${THEME.bodyPx}px ${THEME.fontFamily}`;
      ctx.fillText(c.text, c.x + c.w / 2, c.y + c.h / 2);
      break;
    }
    case 'button': {
      drawButton(ctx, c, c.variant);
      break;
    }
    case 'toggle': {
      drawToggleRow(ctx, c);
      break;
    }
    case 'stepper': {
      drawChips(ctx, c);
      break;
    }
    case 'pips': {
      drawPips(ctx, c);
      break;
    }
    case 'chips': {
      drawChips(ctx, c);
      break;
    }
    case 'tab': {
      drawTab(ctx, c);
      break;
    }
    case 'progress': {
      drawProgressBar(ctx, c.x, c.y, c.w, c.h, c.progress);
      break;
    }
    case 'row': {
      drawRowPlate(ctx, c);
      break;
    }
    default:
      break;
  }
}
