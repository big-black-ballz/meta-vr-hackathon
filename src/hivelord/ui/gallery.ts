import type { World } from '@iwsdk/core';
import { CanvasPanel, UIScreen, UI_PPM } from './screen.js';
import {
  controlAt,
  drawChrome,
  drawControl,
  makeControl,
  type Control,
} from './controls.js';
import { STRINGS } from './strings.js';
import { THEME, withAlpha } from './theme.js';
import {
  drawCheck,
  drawHex,
  drawInfo,
  drawLock,
  drawWarnTriangle,
  drawX,
} from './draw/icons.js';
import { roundRectPath } from './draw/panel.js';
import { drawRadial } from './draw/widgets.js';

/**
 * Dev-only component gallery: every control variant/state, meters, hex
 * ability slots, toasts, subtitle backgrounds and the tracking banner.
 * Used for review and screenshots; not part of the player flow.
 */
export class GalleryScreen extends UIScreen {
  readonly id = 'gallery' as const;
  controls: Control[] = [];

  build(world: World): void {
    this.panel = new CanvasPanel(world, 'hivelord-ui-gallery', 0.62, 0.82);
    const w = this.panel.widthPx;
    const bw = w - 96;
    const add = (
      id: string,
      kind: 'button' | 'toggle' | 'stepper' | 'progress',
      y: number,
      h: number,
      text: string,
    ): Control => {
      const c = makeControl(id, kind, 48, y, bw, h, text);
      this.controls.push(c);
      return c;
    };
    add('primary', 'button', 120, 60, 'Primary CTA').variant = 'primary';
    add('secondary', 'button', 188, 60, 'Secondary');
    add('destructive', 'button', 256, 60, 'Destructive').variant = 'destructive';
    add('disabled', 'button', 324, 60, 'Disabled').enabled = false;
    add('hover', 'button', 392, 60, 'Hover').hover = true;
    add('toggleOn', 'toggle', 468, 48, 'Toggle ON').value = true;
    add('toggleOff', 'toggle', 524, 48, 'Toggle OFF').value = false;
    add('stepper', 'stepper', 588, 56, 'Stepper').value = '88%';
    add('progress', 'progress', 660, 26, '').progress = 0.62;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const c = this.panel;
    if (c == null) {
      return;
    }
    drawChrome(ctx, c.widthPx, c.heightPx, STRINGS.galleryTitle);
    for (const control of this.controls) {
      drawControl(ctx, control);
    }
    const y = 740;
    // Hex ability slots: ready, cooling, active, locked.
    const states = ['ready', 'cool', 'active', 'locked'];
    for (let i = 0; i < 4; i++) {
      const cx = 100 + i * 150;
      const state = states[i];
      if (state === 'ready') {
        drawHex(ctx, cx, y, 38, THEME.primary, null, 2);
        drawCheck(ctx, cx, y, 28, THEME.success);
      } else if (state === 'cool') {
        drawHex(ctx, cx, y, 38, THEME.primary, null, 2);
        ctx.strokeStyle = THEME.primary;
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.arc(cx, y, 30, -Math.PI / 2, Math.PI * 0.3);
        ctx.stroke();
        ctx.fillStyle = THEME.text;
        ctx.font = `600 ${THEME.smallPx}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('5', cx, y);
      } else if (state === 'active') {
        ctx.save();
        ctx.shadowColor = withAlpha(THEME.accent, 0.35);
        ctx.shadowBlur = 14;
        drawHex(ctx, cx, y, 38, THEME.accent, null, 3);
        ctx.restore();
      } else {
        drawHex(ctx, cx, y, 38, THEME.locked, null, 2);
        drawX(ctx, cx, y - 6, 22, THEME.locked);
        drawLock(ctx, cx, y + 16, 18, THEME.locked);
      }
    }
    drawRadial(ctx, c.widthPx - 90, y, 38, 0.7, false);
    // Toast samples with bars/icons.
    const ty = 810;
    const kinds = [
      ['info', THEME.primary],
      ['success', THEME.success],
      ['warning', THEME.warning],
    ] as const;
    for (let i = 0; i < 3; i++) {
      const [kind, color] = kinds[i] ?? kinds[0];
      const py = ty + i * 52;
      ctx.fillStyle = withAlpha(THEME.panel, THEME.panelOpacity);
      roundRectPath(ctx, 48, py, 300, 44, 8);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(48, py + 6, 4, 32);
      if (kind === 'warning') {
        drawWarnTriangle(ctx, 74, py + 22, 22, THEME.warning);
      } else if (kind === 'success') {
        drawCheck(ctx, 74, py + 22, 22, THEME.success);
      } else {
        drawInfo(ctx, 74, py + 22, 22, THEME.primary);
      }
      ctx.fillStyle = THEME.text;
      ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${kind}`, 94, py + 22);
    }
    // Subtitle background modes.
    const modes = ['none', 'light', 'solid'] as const;
    for (let i = 0; i < 3; i++) {
      const py = ty + i * 52;
      const mode = modes[i];
      if (mode === 'solid') {
        ctx.fillStyle = withAlpha(THEME.base, 0.9);
        roundRectPath(ctx, 380, py, 340, 44, 8);
        ctx.fill();
        ctx.strokeStyle = THEME.panelEdge;
        ctx.lineWidth = 1;
        roundRectPath(ctx, 380, py, 340, 44, 8);
        ctx.stroke();
      } else if (mode === 'light') {
        ctx.fillStyle = withAlpha(THEME.base, 0.45);
        roundRectPath(ctx, 380, py, 340, 44, 8);
        ctx.fill();
      }
      if (mode === 'none') {
        ctx.lineWidth = 3;
        ctx.strokeStyle = THEME.base;
        ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
        ctx.strokeText(`subtitle (${mode})`, 392, py + 22);
      }
      ctx.fillStyle = THEME.accentText;
      ctx.font = `700 ${THEME.tinyPx}px ${THEME.fontFamily}`;
      ctx.fillText('Old You', 392, py + 10);
      ctx.fillStyle = THEME.text;
      ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
      ctx.fillText(`subtitle (${mode})`, 392, py + 30);
    }
  }

  onControl(_controlId: string): void {}

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}
