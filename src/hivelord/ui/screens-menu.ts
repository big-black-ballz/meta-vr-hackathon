import type { World } from '@iwsdk/core';
import { gameState } from '../core/GameState.js';
import { CanvasPanel, UIScreen, UI_PPM } from './screen.js';
import {
  controlAt,
  drawChrome,
  drawControl,
  makeControl,
  type Control,
} from './controls.js';
import { drawPanel, drawTitle } from './draw/panel.js';
import { STRINGS } from './strings.js';
import { THEME, withAlpha } from './theme.js';

const PANEL_W_M = 0.52;

function layoutButtons(
  controls: Control[],
  ids: string[],
  labels: string[],
  canvasW: number,
  top: number,
  extraGapBeforeLast = 0,
): void {
  const bw = canvasW - 96;
  const bh = THEME.buttonHPx;
  let y = top;
  for (let i = 0; i < ids.length; i++) {
    if (i === ids.length - 1 && i > 0) {
      y += extraGapBeforeLast;
    }
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
    const hM = panelHeightFor(4, 120);
    this.panel = new CanvasPanel(world, 'hivelord-ui-start', PANEL_W_M, hM);
    this.controls = [];    layoutButtons(
      this.controls,
      ['begin', 'settings', 'skills', 'exit'],
      [
        STRINGS.startBegin,
        STRINGS.startSettings,
        STRINGS.startSkills,
        STRINGS.startExit,
      ],
      this.panel.widthPx,
      166,
      28,
    );
    for (const c of this.controls) {
      if (c.kind === 'button') {
        c.x = 80;
        c.w = this.panel.widthPx - 160;
      }
    }
    const begin = this.controls.find((c) => c.id === 'begin');
    if (begin != null) {
      begin.variant = 'primary';
      begin.defaultFocus = true;
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
      STRINGS.appTitle,
      true,
      88,
      'none',
      STRINGS.startSubtitle,
      THEME.primary,
      30,
    );
    for (const c of this.controls) {
      drawControl(ctx, c);
    }
  }

  /** Begin label/enabled for chapter1 preload gating (UISystem owns the flow). */
  setBeginState(label: string, enabled: boolean): void {
    const begin = this.controls.find((c) => c.id === 'begin');
    if (begin != null && (begin.text !== label || begin.enabled !== enabled)) {
      begin.text = label;
      begin.enabled = enabled;
      this.panel?.setDirty();
    }
  }

  onControl(controlId: string): void {
    switch (controlId) {
      case 'begin':
        gameState.setState('Playing', 'start begin');
        break;      case 'settings':
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
  private tipIndex = 0;
  private tipTimer = 0;
  private sweep = 0;
  private shimmerAccum = 0;
  private readonly tips = [STRINGS.loadingTip, STRINGS.loadingTip2, STRINGS.loadingTip3];

  build(world: World): void {
    this.panel = new CanvasPanel(world, 'hivelord-ui-loading', PANEL_W_M, 0.3);
  }

  setProgress(p: number, label: string): void {
    const next = Math.max(0, Math.min(1, p));
    if (Math.abs(next - this.progress) > 0.004 || label !== this.label) {
      this.progress = next;
      this.label = label;
      this.panel?.setDirty();
    }
  }

  update(dt: number): void {
    this.sweep += dt;
    this.shimmerAccum += dt;
    this.tipTimer += dt;
    if (this.tipTimer >= 2.5) {
      this.tipTimer = 0;
      this.tipIndex = (this.tipIndex + 1) % this.tips.length;
      this.panel?.setDirty();
    }
    if (this.shimmerAccum >= 0.1) {
      this.shimmerAccum = 0;
      this.panel?.setDirty();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.panel == null) {
      return;
    }
    drawChrome(ctx, this.panel.widthPx, this.panel.heightPx, this.label);
    ctx.textAlign = 'center';
    ctx.fillStyle = THEME.textMuted;
    ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
    ctx.fillText(this.tips[this.tipIndex] ?? '', this.panel.widthPx / 2, 128);
    const x = 64;
    const y = 170;
    const w = this.panel.widthPx - 128;
    const h = 34;
    ctx.fillStyle = THEME.panelEdge;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fill();
    const fill = Math.max(h, w * this.progress);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, fill, h, h / 2);
    ctx.clip();
    const grad = ctx.createLinearGradient(x, y, x + fill, y);
    grad.addColorStop(0, THEME.primary);
    grad.addColorStop(1, withAlpha(THEME.primary, 0.75));
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, fill, h);
    const sweepX = x + ((this.sweep * 0.35) % 1) * fill;
    const sweepGrad = ctx.createLinearGradient(sweepX - 60, y, sweepX + 60, y);
    sweepGrad.addColorStop(0, withAlpha(THEME.text, 0));
    sweepGrad.addColorStop(0.5, withAlpha(THEME.text, 0.45));
    sweepGrad.addColorStop(1, withAlpha(THEME.text, 0));
    ctx.fillStyle = sweepGrad;
    ctx.fillRect(sweepX - 60, y, 120, h);
    ctx.restore();
    ctx.fillStyle = THEME.primary;
    ctx.font = `600 ${THEME.smallPx}px ${THEME.fontFamily}`;
    ctx.fillText(`${Math.round(this.progress * 100)}%`, this.panel.widthPx / 2, 240);
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
      cont.defaultFocus = true;
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
