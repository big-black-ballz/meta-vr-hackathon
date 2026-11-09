import type { World } from '@iwsdk/core';
import { CanvasPanel, UIScreen } from './screen.js';
import {
  controlAt,
  drawChrome,
  drawControl,
  drawPips,
  drawChips,
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
import { drawAbilityCard, type CardSkill } from './draw/cards.js';

/**
 * Dev-only component gallery: tabs, rows, pips, chips, toggles, every button
 * variant/state, ability cards, meters, hex slots, toasts and subtitle
 * backgrounds. Used for review and screenshots; not part of the player flow.
 */
export class GalleryScreen extends UIScreen {
  readonly id = 'gallery' as const;
  controls: Control[] = [];

  build(world: World): void {
    this.panel = new CanvasPanel(world, 'hivelord-ui-gallery', 0.62, 0.98);
    const w = this.panel.widthPx;
    const bw = w - 96;
    const add = (
      id: string,
      kind: 'button' | 'toggle' | 'tab' | 'pips' | 'chips',
      y: number,
      h: number,
      text: string,
    ): Control => {
      const c = makeControl(id, kind, 48, y, bw, h, text);
      this.controls.push(c);
      return c;
    };
    const tabW = (bw - 24) / 4;
    for (let i = 0; i < 4; i++) {
      const tab = makeControl(
        `tab-${i}`,
        'tab',
        48 + i * (tabW + 8),
        98,
        tabW,
        54,
        ['Audio', 'Display', 'Hands', 'Comfort'][i] ?? '',
      );
      tab.icon = (['speaker', 'text', 'hand', 'shield'] as const)[i] ?? 'hex';
      tab.value = i === 1;
      this.controls.push(tab);
    }
    add('primary', 'button', 166, 56, 'Primary CTA').variant = 'primary';
    add('secondary', 'button', 230, 56, 'Secondary');
    add('destructive', 'button', 294, 56, 'Destructive').variant = 'destructive';
    add('disabled', 'button', 358, 56, 'Disabled').enabled = false;
    add('hover', 'button', 422, 56, 'Hover').hover = true;
    add('toggleOn', 'toggle', 494, 48, 'Toggle ON').value = true;
    add('toggleOff', 'toggle', 550, 48, 'Toggle OFF').value = false;
    const pips = add('pips', 'pips', 612, 86, 'Volume pips');
    pips.icon = 'speaker';
    pips.value = '0.7';
    pips.desc = 'Ten-step segmented bar.';
    const chips = add('chips', 'chips', 706, 86, 'Segmented chips');
    chips.icon = 'text';
    chips.options = ['Low', 'Medium', 'High'];
    chips.value = 'Medium';
    chips.desc = 'One selected chip.';
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const c = this.panel;
    if (c == null) {
      return;
    }
    drawChrome(ctx, c.widthPx, c.heightPx, STRINGS.galleryTitle, 40);
    // Mini hive crest for the Start hero.
    const crestY = 60;
    for (let i = 0; i < 7; i++) {
      const dx = [0, -1, 1, -1, 1, -2, 2][i] ?? 0;
      const dy = [0, -0.5, -0.5, 0.5, 0.5, 0, 0][i] ?? 0;
      drawHex(
        ctx,
        c.widthPx - 90 + dx * 14,
        crestY + dy * 14,
        9,
        withAlpha(THEME.primary, i === 0 ? 1 : 0.45),
        i === 0 ? withAlpha(THEME.primary, 0.18) : null,
        i === 0 ? 2 : 1,
      );
    }
    for (const control of this.controls) {
      if (control.id === 'pips') {
        drawPips(ctx, control);
      } else if (control.id === 'chips') {
        drawChips(ctx, control);
      } else {
        drawControl(ctx, control);
      }
    }
    // Progress meter.
    drawRadial(ctx, c.widthPx - 90, 800, 34, 0.65, false);
    // Ability cards.
    const cards: CardSkill[] = [
      {
        id: 'call',
        name: 'The Call',
        gestureHint: 'Pinch',
        unlocked: true,
        glyph: 'pinch',
        lockedText: STRINGS.skillsLocked,
      },
      {
        id: 'gather',
        name: 'Gather',
        gestureHint: 'Fist',
        unlocked: false,
        glyph: 'fist',
        lockedText: STRINGS.skillsLocked,
      },
    ];
    drawAbilityCard(ctx, 48, 800, 300, 112, cards[0] as CardSkill, 0);
    drawAbilityCard(ctx, 366, 800, 300, 112, cards[1] as CardSkill, 0.4);
    // Hex ability slots: ready, cooling, active, locked.
    const y = 980;
    const states = ['ready', 'cool', 'active', 'locked'];
    for (let i = 0; i < 4; i++) {
      const cx = 110 + i * 150;
      const state = states[i];
      if (state === 'ready') {
        drawHex(ctx, cx, y, 34, THEME.primary, null, 2);
        drawCheck(ctx, cx, y, 26, THEME.success);
      } else if (state === 'cool') {
        drawHex(ctx, cx, y, 34, THEME.primary, null, 2);
        ctx.strokeStyle = THEME.primary;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(cx, y, 26, -Math.PI / 2, Math.PI * 0.3);
        ctx.stroke();
        ctx.fillStyle = THEME.text;
        ctx.font = `600 ${THEME.smallPx}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('5', cx, y);
      } else if (state === 'active') {
        ctx.save();
        ctx.shadowColor = withAlpha(THEME.accent, 0.35);
        ctx.shadowBlur = 12;
        drawHex(ctx, cx, y, 34, THEME.accent, null, 3);
        ctx.restore();
      } else {
        drawHex(ctx, cx, y, 34, THEME.locked, null, 2);
        drawX(ctx, cx, y - 5, 20, THEME.locked);
        drawLock(ctx, cx, y + 14, 16, THEME.locked);
      }
    }
    // Toast samples.
    const kinds = [
      ['info', THEME.primary],
      ['success', THEME.success],
      ['warning', THEME.warning],
    ] as const;
    for (let i = 0; i < 3; i++) {
      const [kind, color] = kinds[i] ?? kinds[0];
      const py = 1040 + i * 48;
      ctx.fillStyle = withAlpha(THEME.panel, THEME.panelOpacity);
      roundRectPath(ctx, 48, py, 300, 40, 8);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.fillRect(48, py + 5, 4, 30);
      if (kind === 'warning') {
        drawWarnTriangle(ctx, 72, py + 20, 20, THEME.warning);
      } else if (kind === 'success') {
        drawCheck(ctx, 72, py + 20, 20, THEME.success);
      } else {
        drawInfo(ctx, 72, py + 20, 20, THEME.primary);
      }
      ctx.fillStyle = THEME.text;
      ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${kind}`, 92, py + 20);
    }
    const modes = ['none', 'light', 'solid'] as const;
    for (let i = 0; i < 3; i++) {
      const py = 1040 + i * 48;
      const mode = modes[i];
      if (mode === 'solid') {
        ctx.fillStyle = withAlpha(THEME.base, 0.9);
        roundRectPath(ctx, 366, py, 300, 40, 8);
        ctx.fill();
        ctx.strokeStyle = THEME.panelEdge;
        ctx.lineWidth = 1;
        roundRectPath(ctx, 366, py, 300, 40, 8);
        ctx.stroke();
      } else if (mode === 'light') {
        ctx.fillStyle = withAlpha(THEME.base, 0.45);
        roundRectPath(ctx, 366, py, 300, 40, 8);
        ctx.fill();
      }
      if (mode === 'none') {
        ctx.lineWidth = 3;
        ctx.strokeStyle = THEME.base;
        ctx.font = `500 ${THEME.tinyPx}px ${THEME.fontFamily}`;
        ctx.strokeText(`subtitle (${mode})`, 378, py + 22);
      }
      ctx.fillStyle = THEME.accentText;
      ctx.font = `700 ${THEME.tinyPx}px ${THEME.fontFamily}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('Old You', 378, py + 10);
      ctx.fillStyle = THEME.text;
      ctx.font = `500 ${THEME.tinyPx}px ${THEME.fontFamily}`;
      ctx.fillText(`subtitle (${mode})`, 378, py + 28);
    }
  }

  onControl(_controlId: string): void {}

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}
