import type { World } from '@iwsdk/core';
import { gameState } from '../core/GameState.js';
import { CanvasPanel, UIScreen, UI_PPM } from './screen.js';
import {
  controlAt,
  drawChrome,
  drawChromeGlow,
  drawControl,
  makeControl,
  type Control,
} from './controls.js';
import { STRINGS } from './strings.js';
import { THEME } from './theme.js';

const PANEL_W_M = 0.52;

function layoutButtons(
  controls: Control[],
  ids: string[],
  labels: string[],
  canvasW: number,
  top: number,
): void {
  const bw = canvasW - 96;
  const bh = THEME.buttonHPx;
  let y = top;
  for (let i = 0; i < ids.length; i++) {
    controls.push(makeControl(ids[i], 'button', 48, y, bw, bh, labels[i]));
    y += bh + THEME.buttonGapPx;
  }
}

export function panelHeightFor(buttonCount: number, extraPx: number): number {
  return (
    (104 + extraPx + buttonCount * (THEME.buttonHPx + THEME.buttonGapPx)) /
    UI_PPM
  );
}

/** Start screen: title, subtitle, Begin / Settings / Skills / Exit. */
export class StartScreen extends UIScreen {
  readonly id = 'start' as const;
  controls: Control[] = [];
  private world: World | null = null;

  build(world: World): void {
    this.world = world;
    const hM = panelHeightFor(4, 60);
    this.panel = new CanvasPanel(world, 'hivelord-ui-start', PANEL_W_M, hM);
    const label = makeControl(
      'subtitle',
      'label',
      48,
      92,
      this.panel.widthPx - 96,
      40,
      STRINGS.startSubtitle,
    );
    this.controls = [label];
    layoutButtons(
      this.controls,
      ['begin', 'settings', 'skills', 'exit'],
      [
        STRINGS.startBegin,
        STRINGS.startSettings,
        STRINGS.startSkills,
        STRINGS.startExit,
      ],
      this.panel.widthPx,
      150,
    );
    const begin = this.controls.find((c) => c.id === 'begin');
    if (begin != null) {
      begin.variant = 'primary';
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.panel == null) {
      return;
    }
    drawChromeGlow(ctx, this.panel.widthPx, this.panel.heightPx, STRINGS.appTitle);
    for (const c of this.controls) {
      drawControl(ctx, c);
    }
  }

  onControl(controlId: string): void {
    switch (controlId) {
      case 'begin':
        gameState.setState('Playing', 'start begin');
        break;
      case 'settings':
      case 'skills':
        // Pushed by the UI system via UIManager; identifier only.
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

/** Loading screen with a settable progress bar. */
export class LoadingScreen extends UIScreen {
  readonly id = 'loading' as const;
  controls: Control[] = [];
  private progress = 0;
  private label: string = STRINGS.loadingTitle;

  build(world: World): void {
    this.panel = new CanvasPanel(world, 'hivelord-ui-loading', PANEL_W_M, 0.3);
    const bar = makeControl(
      'bar',
      'progress',
      48,
      170,
      this.panel.widthPx - 96,
      36,
    );
    bar.progress = 0;
    this.controls = [bar];
  }

  setProgress(p: number, label: string): void {
    this.progress = Math.max(0, Math.min(1, p));
    this.label = label;
    const bar = this.controls[0];
    if (bar != null) {
      bar.progress = this.progress;
    }
    this.panel?.setDirty();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.panel == null) {
      return;
    }
    drawChrome(ctx, this.panel.widthPx, this.panel.heightPx, this.label);
    ctx.textAlign = 'center';
    ctx.fillStyle = THEME.textMuted;
    ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
    ctx.fillText(
      STRINGS.loadingTip,
      this.panel.widthPx / 2,
      128,
    );
    for (const c of this.controls) {
      drawControl(ctx, c);
    }
    ctx.fillStyle = THEME.primary;
    ctx.fillText(
      `${Math.round(this.progress * 100)}%`,
      this.panel.widthPx / 2,
      240,
    );
  }

  onControl(_controlId: string): void {}

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}

/** Chapter-complete screen. */
export class ChapterScreen extends UIScreen {
  readonly id = 'chapter' as const;
  controls: Control[] = [];
  private world: World | null = null;

  build(world: World): void {
    this.world = world;
    void this.world;
    const hM = panelHeightFor(2, 120);
    this.panel = new CanvasPanel(world, 'hivelord-ui-chapter', PANEL_W_M, hM);
    const summary = makeControl(
      'summary',
      'label',
      48,
      100,
      this.panel.widthPx - 96,
      90,
      STRINGS.chapterSummary,
    );
    this.controls = [summary];
    layoutButtons(
      this.controls,
      ['continue', 'menu'],
      [STRINGS.chapterContinue, STRINGS.chapterMenu],
      this.panel.widthPx,
      210,
    );
    const cont = this.controls.find((c) => c.id === 'continue');
    if (cont != null) {
      cont.variant = 'primary';
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.panel == null) {
      return;
    }
    drawChrome(
      ctx,
      this.panel.widthPx,
      this.panel.heightPx,
      STRINGS.chapterTitle,
    );
    for (const c of this.controls) {
      drawControl(ctx, c);
    }
  }

  onControl(controlId: string): void {
    if (controlId === 'continue' || controlId === 'menu') {
      gameState.setState('Menu', 'chapter complete');
    }
  }

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}
