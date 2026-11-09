import { THEME } from './theme.js';
import { drawPanel, drawTitle } from './draw/panel.js';
import {
  drawButton,
  drawProgressBar,
  drawStepperControl,
  drawToggleControl,
  type ButtonVariant,
} from './draw/widgets.js';

export type { ButtonVariant };
export { drawRadial } from './draw/widgets.js';

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
  /** button hierarchy: primary CTA, secondary default, destructive. */
  variant: ButtonVariant;
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
    enabled: true,
    value: false,
    options: [],
    progress: 0,
    variant,
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
    if (
      !c.enabled ||
      c.kind === 'label' ||
      c.kind === 'progress' ||
      c.kind === 'row'
    ) {
      continue;
    }
    if (px >= c.x && px <= c.x + c.w && py >= c.y && py <= c.y + c.h) {
      return c;
    }
  }
  return null;
}

/** Obsidian panel + primary title with hex divider. */
export function drawChrome(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
): void {
  drawPanel(ctx, w, h);
  drawTitle(ctx, w, title, false);
}

/** Same chrome with a soft gold glow behind the title (Start screen). */
export function drawChromeGlow(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  title: string,
): void {
  drawPanel(ctx, w, h);
  drawTitle(ctx, w, title, true);
}

export function drawControl(ctx: CanvasRenderingContext2D, c: Control): void {
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
      drawToggleControl(ctx, c);
      break;
    }
    case 'stepper': {
      drawStepperControl(ctx, c);
      break;
    }
    case 'progress': {
      drawProgressBar(ctx, c.x, c.y, c.w, c.h, c.progress);
      break;
    }
    case 'row': {
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = c.enabled ? THEME.text : THEME.textMuted;
      ctx.font = `600 ${THEME.bodyPx}px ${THEME.fontFamily}`;
      ctx.fillText(c.text, c.x, c.y + 22);
      ctx.fillStyle = THEME.textFaint;
      ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
      ctx.fillText(c.sub, c.x, c.y + c.h - 18);
      break;
    }
    case 'hit': {
      break;
    }
    default:
      break;
  }
}
