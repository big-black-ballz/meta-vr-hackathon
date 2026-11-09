import type { World } from '@iwsdk/core';
import { gameState } from '../core/GameState.js';
import { hivelordEvents } from '../core/EventBus.js';
import { getGestureDetector } from '../input/InputSystem.js';
import { CanvasPanel, UIScreen, UI_PPM } from './screen.js';
import {
  controlAt,
  drawChrome,
  drawControl,
  makeControl,
  type Control,
} from './controls.js';
import { STRINGS } from './strings.js';
import { THEME } from './theme.js';
import { drawHex, drawLock, drawWarnTriangle } from './draw/icons.js';
import { drawPanel, drawTitle } from './draw/panel.js';
import {
  getErrorMessage,
  takePendingConfirm,
  type ConfirmOptions,
} from './UIManager.js';
import {
  getPlaceholderSkills,
  unlockSkill as unlockPlaceholderSkill,
} from './placeholderSkills.js';
import { settings } from './settings.js';
import { setMasterVolume } from './sounds.js';

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
    drawChrome(ctx, this.panel.widthPx, this.panel.heightPx, STRINGS.pauseTitle);
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

/** Settings screen: compact rows of steppers, toggles and actions. */
export class SettingsScreen extends UIScreen {
  readonly id = 'settings' as const;
  controls: Control[] = [];
  private rows: SettingRow[] = [
    { key: 'master', label: STRINGS.settingsMaster, kind: 'stepper' },
    { key: 'music', label: STRINGS.settingsMusic, kind: 'stepper' },
    { key: 'sfx', label: STRINGS.settingsSfx, kind: 'stepper' },
    { key: 'voice', label: STRINGS.settingsVoice, kind: 'stepper' },
    { key: 'subtitlesOn', label: STRINGS.settingsSubtitlesOn, kind: 'toggle' },
    { key: 'subtitleSize', label: STRINGS.settingsSubtitleSize, kind: 'stepper' },
    { key: 'subtitleBg', label: STRINGS.settingsSubtitleBg, kind: 'stepper' },
    { key: 'dominantHand', label: STRINGS.settingsDominant, kind: 'stepper' },
    { key: 'quality', label: STRINGS.settingsQuality, kind: 'stepper' },
    { key: 'uiOpacity', label: STRINGS.settingsUiOpacity, kind: 'stepper' },
    {
      key: 'highContrast',
      label: STRINGS.settingsHighContrast,
      kind: 'toggle',
    },
    { key: 'reduceFlashing', label: STRINGS.settingsReduceFlash, kind: 'toggle' },
    { key: 'vignette', label: STRINGS.settingsVignette, kind: 'toggle' },
    { key: 'debugOverlay', label: STRINGS.settingsDebugOverlay, kind: 'toggle' },
    { key: 'reset', label: STRINGS.settingsReset, kind: 'action' },
  ];

  build(world: World): void {
    const rowH = 54;
    const hM = (110 + this.rows.length * (rowH + 8) + 84) / UI_PPM;
    this.panel = new CanvasPanel(world, 'hivelord-ui-settings', 0.56, hM);
    const w = this.panel.widthPx;
    let y = 104;
    for (const row of this.rows) {
      if (row.kind === 'action') {
        this.controls.push(
          makeControl(row.key, 'button', 48, y, w - 96, 56, row.label),
        );
      } else if (row.kind === 'toggle') {
        const c = makeControl(row.key, 'toggle', 48, y, w - 96, rowH, row.label);
        this.controls.push(c);
      } else {
        const c = makeControl(row.key, 'stepper', 48, y, w - 96, rowH, row.label);
        this.controls.push(c);
        // Invisible - / + zones over the drawn stepper buttons.
        const vy = y + rowH / 2;
        this.controls.push(
          makeControl(`${row.key}:dec`, 'hit', 48 + (w - 96) - 342, vy - 30, 76, 60),
        );
        this.controls.push(
          makeControl(`${row.key}:inc`, 'hit', 48 + (w - 96) - 76, vy - 30, 76, 60),
        );
      }
      y += rowH + 8;
    }
    this.controls.push(
      makeControl('back', 'button', 48, y + 8, w - 96, 60, STRINGS.settingsBack),
    );
    this.refreshValues();
  }

  refreshValues(): void {
    const snap = settings.snapshot();
    for (const c of this.controls) {
      switch (c.id) {
        case 'master':
        case 'music':
        case 'sfx':
        case 'voice':
          c.value = String(Math.round((snap[c.id] as number) * 10));
          break;
        case 'subtitlesOn':
        case 'reduceFlashing':
        case 'vignette':
        case 'debugOverlay':
          c.value = (snap[c.id] as boolean) === true;
          break;
        case 'subtitleSize':
          c.value = snap.subtitleSize;
          break;
        case 'subtitleBg':
          c.value = snap.subtitleBg;
          break;
        case 'dominantHand':
          c.value = snap.dominantHand;
          break;
        case 'quality':
          c.value = snap.quality;
          break;
        case 'uiOpacity':
          c.value = `${Math.round(snap.uiOpacity * 100)}%`;
          break;
        case 'highContrast':
          c.value = snap.highContrast === true;
          break;
        default:
          break;
      }
    }
    this.panel?.setDirty();
  }

  onShow(): void {
    this.refreshValues();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.panel == null) {
      return;
    }
    drawChrome(
      ctx,
      this.panel.widthPx,
      this.panel.heightPx,
      STRINGS.settingsTitle,
    );
    for (const c of this.controls) {
      drawControl(ctx, c);
    }
  }

  step(id: string, dir: 1 | -1): void {
    const snap = settings.snapshot();
    switch (id) {
      case 'master':
      case 'music':
      case 'sfx':
      case 'voice': {
        const next =
          Math.max(0, Math.min(10, Math.round((snap[id] as number) * 10) + dir)) /
          10;
        settings.set(id, next);
        if (id === 'master') {
          setMasterVolume(next);
        }
        break;
      }
      case 'subtitleSize': {
        const order = ['S', 'M', 'L'] as const;
        const next =
          order[(order.indexOf(snap.subtitleSize) + dir + 3) % 3] ?? 'M';
        settings.set('subtitleSize', next);
        break;
      }
      case 'subtitleBg': {
        const order = ['none', 'light', 'solid'] as const;
        const next =
          order[(order.indexOf(snap.subtitleBg) + dir + 3) % 3] ?? 'light';
        settings.set('subtitleBg', next);
        break;
      }
      case 'dominantHand': {
        const order = ['left', 'right', 'auto'] as const;
        const next =
          order[(order.indexOf(snap.dominantHand) + dir + 3) % 3] ?? 'auto';
        settings.set('dominantHand', next);
        getGestureDetector()?.setDominantHand(next);
        break;
      }
      case 'quality': {
        const order = ['low', 'medium', 'high'] as const;
        const next =
          order[(order.indexOf(snap.quality) + dir + 3) % 3] ?? 'medium';
        settings.set('quality', next);
        break;
      }
      case 'uiOpacity': {
        const order = [0.8, 0.88, 0.95];
        const index = order.findIndex(
          (v) => Math.abs(v - snap.uiOpacity) < 0.001,
        );
        const next = order[(index + dir + 3) % 3] ?? 0.88;
        settings.set('uiOpacity', next);
        break;
      }
      default:
        break;
    }
    this.refreshValues();
  }

  toggle(id: string): void {
    switch (id) {
      case 'subtitlesOn':
        settings.set('subtitlesOn', !settings.get('subtitlesOn'));
        break;
      case 'reduceFlashing':
        settings.set('reduceFlashing', !settings.get('reduceFlashing'));
        break;
      case 'vignette':
        settings.set('vignette', !settings.get('vignette'));
        break;
      case 'debugOverlay':
        settings.set('debugOverlay', !settings.get('debugOverlay'));
        break;
      case 'highContrast':
        settings.set('highContrast', !settings.get('highContrast'));
        break;
      default:
        break;
    }
    this.refreshValues();
  }

  onControl(controlId: string): void {
    if (controlId.endsWith(':dec')) {
      this.step(controlId.slice(0, -4), -1);
      return;
    }
    if (controlId.endsWith(':inc')) {
      this.step(controlId.slice(0, -4), 1);
      return;
    }
    const c = this.controls.find((entry) => entry.id === controlId);
    if (c == null) {
      return;
    }
    if (c.kind === 'toggle') {
      this.toggle(controlId);
    }
  }

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}

/** Skill grid: six abilities with locked/unlocked styling. */
export class SkillsScreen extends UIScreen {
  readonly id = 'skills' as const;
  controls: Control[] = [];

  build(world: World): void {
    const rowH = 72;
    const rowStep = 76;
    const hM = (120 + 6 * rowStep + 84) / UI_PPM;
    this.panel = new CanvasPanel(world, 'hivelord-ui-skills', 0.56, hM);
    const w = this.panel.widthPx;
    let y = 110;
    const list = getPlaceholderSkills();
    for (const skill of list) {
      const row = makeControl(`skill-${skill.id}`, 'row', 48, y, w - 96, rowH, skill.name);
      row.sub = skill.unlocked ? skill.gestureHint : STRINGS.skillsLocked;
      row.enabled = skill.unlocked;
      this.controls.push(row);
      y += rowStep;
    }
    this.controls.push(
      makeControl('back', 'button', 48, y + 10, w - 96, 60, STRINGS.settingsBack),
    );
  }

  onShow(): void {
    const list = getPlaceholderSkills();
    for (const c of this.controls) {
      if (!c.id.startsWith('skill-')) {
        continue;
      }
      const skill = list.find((entry) => `skill-${entry.id}` === c.id);
      if (skill != null) {
        c.sub = skill.unlocked ? skill.gestureHint : STRINGS.skillsLocked;
        c.enabled = skill.unlocked;
      }
    }
    this.panel?.setDirty();
  }

  draw(ctx: CanvasRenderingContext2D): void {
    if (this.panel == null) {
      return;
    }
    drawChrome(ctx, this.panel.widthPx, this.panel.heightPx, STRINGS.skillsTitle);
    for (const c of this.controls) {
      drawControl(ctx, c);
      if (c.kind === 'row') {
        const ix = c.x + c.w - 44;
        const iy = c.y + c.h / 2;
        if (c.enabled) {
          drawHex(ctx, ix, iy, 20, THEME.primary, null, 2);
        } else {
          drawHex(ctx, ix, iy, 20, THEME.locked, null, 2);
          drawLock(ctx, ix, iy, 22, THEME.textFaint);
        }
      }
    }
  }

  onControl(_controlId: string): void {}

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}

/** Reusable blocking confirm dialog, default focus on Cancel. */
export class ConfirmScreen extends UIScreen {
  readonly id = 'confirm' as const;
  controls: Control[] = [];
  private opts: ConfirmOptions | null = null;

  build(world: World): void {
    this.panel = new CanvasPanel(world, 'hivelord-ui-confirm', 0.5, 0.34);
    const w = this.panel.widthPx;
    const msg = makeControl('msg', 'label', 40, 108, w - 80, 70, '');
    const confirm = makeControl(
      'confirm',
      'button',
      40,
      200,
      (w - 100) / 2,
      THEME.buttonHPx,
      STRINGS.confirmYes,
    );
    const cancel = makeControl(
      'cancel',
      'button',
      60 + (w - 100) / 2,
      200,
      (w - 100) / 2,
      THEME.buttonHPx,
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
    drawChrome(
      ctx,
      this.panel.widthPx,
      this.panel.heightPx,
      this.opts?.title ?? STRINGS.confirmTitle,
    );
    for (const c of this.controls) {
      drawControl(ctx, c);
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

export function unlockSkillForTest(id: string): boolean {
  return unlockPlaceholderSkill(id);
}
