import type { World } from '@iwsdk/core';
import { gameState } from '../core/GameState.js';
import { hivelordEvents } from '../core/EventBus.js';
import { CanvasPanel, UIScreen, UI_PPM } from './screen.js';
import {
  controlAt,
  drawControl,
  makeControl,
  type Control,
} from './controls.js';
import { STRINGS } from './strings.js';
import { THEME } from './theme.js';
import { drawWarnTriangle } from './draw/icons.js';
import { drawPanel, drawTitle } from './draw/panel.js';
import {
  getErrorMessage,
  takePendingConfirm,
  type ConfirmOptions,
} from './UIManager.js';

const PANEL_W_M = 0.52;

/** Pause menu. */
export class PauseScreen extends UIScreen {
  readonly id = 'pause' as const;
  controls: Control[] = [];
  private world: World | null = null;

  build(world: World): void {
    this.world = world;
    const labels = [
      STRINGS.pauseResume,
      STRINGS.pauseRestart,
      STRINGS.pauseSettings,
      STRINGS.pauseSkills,
      STRINGS.pauseRecenter,
      STRINGS.pauseExit,
    ];
    const hM =
      (104 +
        labels.length * (THEME.buttonHPx + THEME.buttonGapPx) +
        28) /
      UI_PPM;
    this.panel = new CanvasPanel(world, 'hivelord-ui-pause', PANEL_W_M, hM);
    const bw = this.panel.widthPx - 96;
    let y = 104;
    const ids = [
      'resume',
      'restart',
      'settings',
      'skills',
      'recenter',
      'exit',
    ];
    for (let i = 0; i < ids.length; i++) {
      if (i === ids.length - 1 && i > 0) {
        y += 28;
      }
      this.controls.push(
        makeControl(ids[i], 'button', 48, y, bw, THEME.buttonHPx, labels[i]),
      );
      y += THEME.buttonHPx + THEME.buttonGapPx;
    }
    const resume = this.controls.find((c) => c.id === 'resume');
    if (resume != null) {
      resume.variant = 'primary';
      resume.defaultFocus = true;
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.panel == null) {
      return;
    }
    drawPanel(ctx, this.panel.widthPx, this.panel.heightPx);
    drawTitle(
      ctx,
      this.panel.widthPx,
      STRINGS.pauseTitle,
      false,
      52,
      'pause',
      '',
      THEME.textMuted,
    );
    for (const c of this.controls) {
      drawControl(ctx, c);
    }
  }

  onControl(controlId: string): void {
    switch (controlId) {
      case 'resume':
        gameState.setState('Playing', 'pause resume');
        break;
      case 'recenter':
        hivelordEvents.emit('ToastRequested', {
          text: STRINGS.toastRecentered,
          kind: 'info',
        });
        break;
      case 'exit':
        this.world?.exitXR();
        break;
      default:
        break;
    }
  }

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}

interface SettingRow {
  key: string;
  label: string;
  kind: 'stepper' | 'toggle' | 'action';
}

/** Reusable blocking confirm dialog, default focus on Cancel. */
export class ConfirmScreen extends UIScreen {
  readonly id = 'confirm' as const;
  controls: Control[] = [];
  private opts: ConfirmOptions | null = null;

  build(world: World): void {
    this.panel = new CanvasPanel(world, 'hivelord-ui-confirm', 0.44, 0.32);
    const w = this.panel.widthPx;
    const msg = makeControl('msg', 'label', 40, 108, w - 80, 74, '');
    const btnW = (w - 100) / 2;
    const confirm = makeControl(
      'confirm',
      'button',
      40,
      200,
      btnW,
      64,
      STRINGS.confirmYes,
    );
    const cancel = makeControl(
      'cancel',
      'button',
      60 + btnW,
      200,
      btnW,
      64,
      STRINGS.confirmNo,
    );
    cancel.hover = true;
    this.controls = [msg, confirm, cancel];
  }

  onShow(): void {
    this.opts = takePendingConfirm();
    const msg = this.controls[0];
    if (msg != null) {
      msg.text = this.opts?.message ?? '';
    }
    const confirm = this.controls.find((c) => c.id === 'confirm');
    if (confirm != null) {
      confirm.variant =
        this.opts?.destructive === true ? 'destructive' : 'primary';
    }
    for (const c of this.controls) {
      c.hover = c.id === 'cancel';
      c.defaultFocus = c.id === 'cancel';
    }
    this.panel?.setDirty();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.panel == null) {
      return;
    }
    drawPanel(ctx, this.panel.widthPx, this.panel.heightPx);
    drawTitle(
      ctx,
      this.panel.widthPx,
      this.opts?.title ?? STRINGS.confirmTitle,
      false,
      50,
      this.opts?.destructive === true ? 'warning' : 'hex',
    );
    const msg = this.controls[0];
    if (msg != null) {
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = THEME.textMuted;
      ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
      const maxWidth = this.panel.widthPx - 80;
      const words = msg.text.split(' ');
      let line = '';
      let lineY = 118;
      for (const word of words) {
        const test = line === '' ? word : `${line} ${word}`;
        if (ctx.measureText(test).width > maxWidth && line !== '') {
          ctx.fillText(line, this.panel.widthPx / 2, lineY);
          line = word;
          lineY += 28;
        } else {
          line = test;
        }
      }
      if (line !== '') {
        ctx.fillText(line, this.panel.widthPx / 2, lineY);
      }
    }
    for (const c of this.controls) {
      if (c.kind !== 'label') {
        drawControl(ctx, c);
      }
    }
  }

  onControl(controlId: string): void {
    if (controlId === 'confirm') {
      const cb = this.opts?.onConfirm;
      this.opts = null;
      cb?.();
    } else {
      this.opts = null;
    }
  }

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}

/** In-world runtime error screen. */
export class ErrorScreen extends UIScreen {
  readonly id = 'error' as const;
  controls: Control[] = [];
  private world: World | null = null;

  build(world: World): void {
    this.world = world;
    this.panel = new CanvasPanel(world, 'hivelord-ui-error', PANEL_W_M, 0.4);
    const w = this.panel.widthPx;
    const msg = makeControl('msg', 'label', 40, 138, w - 80, 64, '');
    const retry = makeControl(
      'retry',
      'button',
      48,
      220,
      w - 96,
      THEME.buttonHPx,
      STRINGS.errorRetry,
      'primary',
    );
    const exit = makeControl(
      'exit',
      'button',
      48,
      220 + THEME.buttonHPx + THEME.buttonGapPx,
      w - 96,
      THEME.buttonHPx,
      STRINGS.errorExit,
    );
    this.controls = [msg, retry, exit];
    retry.defaultFocus = true;
  }

  onShow(): void {
    const msg = this.controls[0];
    if (msg != null) {
      msg.text = getErrorMessage();
    }
    this.panel?.setDirty();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.panel == null) {
      return;
    }
    drawPanel(ctx, this.panel.widthPx, this.panel.heightPx);
    drawWarnTriangle(ctx, this.panel.widthPx / 2, 30, 26, THEME.warning);
    drawTitle(ctx, this.panel.widthPx, STRINGS.errorTitle, false, 72);
    for (const c of this.controls) {
      drawControl(ctx, c);
    }
  }

  onControl(controlId: string): void {
    if (controlId === 'retry') {
      gameState.setState('Menu', 'error retry');
    } else if (controlId === 'exit') {
      this.world?.exitXR();
    }
  }

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}
