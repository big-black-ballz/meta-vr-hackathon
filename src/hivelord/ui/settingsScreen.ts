import type { World } from '@iwsdk/core';
import { CanvasPanel, UIScreen, UI_PPM } from './screen.js';
import {
  controlAt,
  drawControl,
  makeControl,
  type Control,
} from './controls.js';
import { drawPanel, drawTitle } from './draw/panel.js';
import { getGestureDetector } from '../input/InputSystem.js';
import { DEBUG } from '../core/config.js';
import { STRINGS } from './strings.js';
import { THEME, withAlpha } from './theme.js';
import { settings } from './settings.js';
import { setMasterVolume } from './sounds.js';

export type SettingsTab = 'audio' | 'display' | 'hands' | 'comfort';

const PANEL_W = 0.56;
const PANEL_H = 0.6;
const TAB_Y = 104;
const TAB_H = 58;
const TAB_GAP = 8;
const ROW_X = 48;
const ROW_Y = 176;
const ROW_H = 86;
const ROW_GAP = 6;

interface TabDef {
  id: SettingsTab;
  label: string;
  icon: 'speaker' | 'text' | 'hand' | 'shield';
  desc: string;
}

const TABS: TabDef[] = [
  { id: 'audio', label: STRINGS.settingsTabAudio, icon: 'speaker', desc: STRINGS.settingsAudioDesc },
  { id: 'display', label: STRINGS.settingsTabDisplay, icon: 'text', desc: STRINGS.settingsDisplayDesc },
  { id: 'hands', label: STRINGS.settingsTabHands, icon: 'hand', desc: STRINGS.settingsHandsDesc },
  { id: 'comfort', label: STRINGS.settingsTabComfort, icon: 'shield', desc: STRINGS.settingsComfortDesc },
];

/**
 * Settings with four tabs, plate rows, icon medallions, segmented pip bars and
 * chips. Touch geometry is generated with the same padded hit meshes as every
 * other screen; only the visual language changed.
 */
export class SettingsScreen extends UIScreen {
  readonly id = 'settings' as const;
  controls: Control[] = [];
  private readonly tabs: Control[] = [];
  private readonly rowsByTab: Record<SettingsTab, Control[]> = {
    audio: [],
    display: [],
    hands: [],
    comfort: [],
  };
  private activeTab: SettingsTab = 'audio';
  private tabFade = 0;

  build(world: World): void {
    this.panel = new CanvasPanel(world, 'hivelord-ui-settings', PANEL_W, PANEL_H);
    const w = this.panel.widthPx;
    const tabW = (w - 96 - TAB_GAP * 3) / 4;
    for (let i = 0; i < TABS.length; i++) {
      const tab = TABS[i] ?? TABS[0];
      const c = makeControl(`tab-${tab.id}`, 'tab', 48 + i * (tabW + TAB_GAP), TAB_Y, tabW, TAB_H, tab.label);
      c.icon = tab.icon;
      c.value = tab.id === this.activeTab;
      this.tabs.push(c);
    }

    this.buildAudio();
    this.buildDisplay();
    this.buildHands();
    this.buildComfort();

    const back = makeControl('back', 'button', ROW_X, this.panel.heightPx - 76, w - 96, 56, STRINGS.settingsBack);
    back.defaultFocus = false;
    this.controls = [...this.tabs];
    for (const tab of TABS) {
      this.controls.push(...this.rowsByTab[tab.id]);
    }
    this.controls.push(back);
    this.syncHidden();
    this.refreshValues();
  }

  private nextRowY(tab: SettingsTab): number {
    const rows = this.rowsByTab[tab];
    const rowCount = rows.filter((c) => c.kind !== 'hit').length;
    return ROW_Y + rowCount * (ROW_H + ROW_GAP);
  }

  private addRow(tab: SettingsTab, c: Control): Control {
    this.rowsByTab[tab].push(c);
    return c;
  }

  private addPips(
    tab: SettingsTab,
    id: string,
    label: string,
    desc: string,
    icon: 'speaker' | 'gauge',
  ): Control {
    const w = this.panel?.widthPx ?? 689;
    const row = this.addRow(
      tab,
      makeControl(id, 'pips', ROW_X, this.nextRowY(tab), w - 96, ROW_H, label),
    );
    row.icon = icon;
    row.desc = desc;
    const pipsX = row.x + 300;
    for (let i = 0; i < 10; i++) {
      const hit = makeControl(`${id}:pip:${i}`, 'hit', pipsX + i * 20 - 2, row.y + 15, 20, 56);
      this.addRow(tab, hit);
    }
    this.addRow(tab, makeControl(`${id}:minus`, 'hit', pipsX - 44, row.y + 15, 36, 56));
    this.addRow(tab, makeControl(`${id}:plus`, 'hit', pipsX + 198, row.y + 15, 36, 56));
    return row;
  }

  private addChips(
    tab: SettingsTab,
    id: string,
    label: string,
    desc: string,
    icon: Control['icon'],
    options: string[],
  ): Control {
    const w = this.panel?.widthPx ?? 689;
    const row = this.addRow(
      tab,
      makeControl(id, 'chips', ROW_X, this.nextRowY(tab), w - 96, ROW_H, label),
    );
    row.icon = icon;
    row.desc = desc;
    row.options = options;
    const areaX = row.x + 300;
    const areaW = row.w - 14 - 300;
    const gap = 6;
    const chipW = (areaW - gap * (options.length - 1)) / options.length;
    for (let i = 0; i < options.length; i++) {
      this.addRow(
        tab,
        makeControl(
          `${id}:chip:${i}`,
          'hit',
          areaX + i * (chipW + gap),
          row.y + 15,
          chipW,
          56,
        ),
      );
    }
    return row;
  }

  private addToggle(
    tab: SettingsTab,
    id: string,
    label: string,
    desc: string,
    icon: Control['icon'],
  ): Control {
    const w = this.panel?.widthPx ?? 689;
    const row = this.addRow(
      tab,
      makeControl(id, 'toggle', ROW_X, this.nextRowY(tab), w - 96, ROW_H, label),
    );
    row.icon = icon;
    row.desc = desc;
    return row;
  }

  private buildAudio(): void {
    this.addPips('audio', 'master', STRINGS.settingsMaster, STRINGS.settingsMasterDesc, 'speaker');
    this.addPips('audio', 'music', STRINGS.settingsMusic, STRINGS.settingsMusicDesc, 'speaker');
    this.addPips('audio', 'sfx', STRINGS.settingsSfx, STRINGS.settingsSfxDesc, 'speaker');
    this.addPips('audio', 'voice', STRINGS.settingsVoice, STRINGS.settingsVoiceDesc, 'speaker');
  }

  private buildDisplay(): void {
    this.addToggle('display', 'subtitlesOn', STRINGS.settingsSubtitlesOn, STRINGS.settingsSubtitlesDesc, 'text');
    this.addChips('display', 'subtitleSize', STRINGS.settingsSubtitleSize, STRINGS.settingsSubtitleSizeDesc, 'text', ['S', 'M', 'L']);
    this.addChips('display', 'subtitleBg', STRINGS.settingsSubtitleBg, STRINGS.settingsSubtitleBgDesc, 'text', ['None', 'Light', 'Solid']);
    this.addChips('display', 'uiOpacity', STRINGS.settingsUiOpacity, STRINGS.settingsUiOpacityDesc, 'eye', ['80%', '88%', '95%']);
    this.addChips('display', 'quality', STRINGS.settingsQuality, STRINGS.settingsQualityDesc, 'gauge', ['Low', 'Medium', 'High']);
  }

  private buildHands(): void {
    this.addChips('hands', 'dominantHand', STRINGS.settingsDominant, STRINGS.settingsDominantDesc, 'hand', ['Left', 'Right', 'Auto']);
  }

  private buildComfort(): void {
    this.addToggle('comfort', 'reduceFlashing', STRINGS.settingsReduceFlash, 'Static states instead of shimmer.', 'eye');
    this.addToggle('comfort', 'vignette', STRINGS.settingsVignette, 'Soften fast motion at the edges.', 'shield');
    this.addToggle('comfort', 'highContrast', STRINGS.settingsHighContrast, 'Brighter text and edges.', 'eye');
    if (DEBUG) {
      this.addToggle('comfort', 'debugOverlay', STRINGS.settingsDebugOverlay, STRINGS.settingsDebugDesc, 'info');
    }
    const reset = this.addRow(
      'comfort',
      makeControl(
        'reset',
        'button',
        ROW_X,
        this.nextRowY('comfort') + 10,
        (this.panel?.widthPx ?? 689) - 96,
        60,
        STRINGS.settingsReset,
        'destructive',
      ),
    );
    reset.desc = STRINGS.settingsResetDesc;
    reset.defaultFocus = false;
  }

  private syncHidden(): void {
    for (const tab of TABS) {
      const hidden = tab.id !== this.activeTab;
      for (const c of this.rowsByTab[tab.id]) {
        c.hidden = hidden;
      }
    }
    for (const tab of this.tabs) {
      tab.value = tab.id === `tab-${this.activeTab}`;
    }
  }

  refreshValues(): void {
    const snap = settings.snapshot();
    for (const tab of TABS) {
      for (const c of this.rowsByTab[tab.id]) {
        switch (c.id) {
          case 'master':
          case 'music':
          case 'sfx':
          case 'voice':
            c.value = String(snap[c.id] ?? 0.5);
            break;
          case 'subtitleSize':
            c.value = snap.subtitleSize;
            break;
          case 'subtitleBg':
            c.value =
              snap.subtitleBg === 'none'
                ? 'None'
                : snap.subtitleBg === 'light'
                  ? 'Light'
                  : 'Solid';
            break;
          case 'uiOpacity':
            c.value = `${Math.round(snap.uiOpacity * 100)}%`;
            break;
          case 'quality':
            c.value =
              snap.quality === 'low'
                ? 'Low'
                : snap.quality === 'medium'
                  ? 'Medium'
                  : 'High';
            break;
          case 'dominantHand':
            c.value =
              snap.dominantHand === 'left'
                ? 'Left'
                : snap.dominantHand === 'right'
                  ? 'Right'
                  : 'Auto';
            break;
          case 'subtitlesOn':
          case 'reduceFlashing':
          case 'vignette':
          case 'debugOverlay':
          case 'highContrast':
            c.value = snap[c.id] === true;
            break;
          default:
            break;
        }
      }
    }
    this.panel?.setDirty();
  }

  onShow(): void {
    this.syncHidden();
    this.refreshValues();
    this.tabFade = 0;
  }

  update(dt: number): void {
    let dirty = false;
    for (const c of this.controls) {
      if (c.kind === 'toggle') {
        const target = c.value === true ? 1 : 0;
        if (settings.get('reduceFlashing')) {
          if (c.anim !== target) {
            c.anim = target;
            dirty = true;
          }
        } else if (Math.abs(c.anim - target) > 0.002) {
          c.anim += (target - c.anim) * Math.min(1, dt * 14);
          dirty = true;
        } else if (c.anim !== target) {
          c.anim = target;
        }
      }
      if (c.pop > 0) {
        c.pop = Math.max(0, c.pop - dt * 3);
        dirty = true;
      }
    }
    if (this.tabFade > 0) {
      this.tabFade = Math.max(0, this.tabFade - dt / 0.15);
      dirty = true;
    }
    if (dirty) {
      this.panel?.setDirty();
    }
  }

  private setVolume(id: string, value: number): void {
    const v = Math.max(0, Math.min(1, Math.round(value * 10) / 10));
    settings.set(id as 'master' | 'music' | 'sfx' | 'voice', v);
    if (id === 'master') {
      setMasterVolume(v);
    }
    const row = this.rowsByTab.audio.find((c) => c.id === id);
    if (row != null) {
      row.pop = 1;
    }
    this.refreshValues();
  }

  private setChip(id: string, option: string): void {
    switch (id) {
      case 'subtitleSize':
        settings.set('subtitleSize', option as 'S' | 'M' | 'L');
        break;
      case 'subtitleBg':
        settings.set(
          'subtitleBg',
          option === 'None' ? 'none' : option === 'Light' ? 'light' : 'solid',
        );
        break;
      case 'uiOpacity':
        settings.set(
          'uiOpacity',
          option === '80%' ? 0.8 : option === '95%' ? 0.95 : 0.88,
        );
        break;
      case 'quality':
        settings.set(
          'quality',
          option === 'Low' ? 'low' : option === 'High' ? 'high' : 'medium',
        );
        break;
      case 'dominantHand': {
        const hand =
          option === 'Left' ? 'left' : option === 'Right' ? 'right' : 'auto';
        settings.set('dominantHand', hand);
        getGestureDetector()?.setDominantHand(hand);
        break;
      }
      default:
        break;
    }
    const row = this.controls.find((c) => c.id === id);
    if (row != null) {
      row.pop = 1;
    }
    this.refreshValues();
  }

  private toggle(id: string): void {
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
    if (controlId.startsWith('tab-')) {
      const next = controlId.slice(4) as SettingsTab;
      if (next !== this.activeTab) {
        this.activeTab = next;
        this.tabFade = 1;
        this.syncHidden();
        this.refreshValues();
        this.panel?.setDirty();
      }
      return;
    }
    if (controlId.endsWith(':minus') || controlId.endsWith(':plus')) {
      const id = controlId.slice(0, -6);
      const current = Number(
        settings.get(id as 'master' | 'music' | 'sfx' | 'voice'),
      );
      this.setVolume(id, current + (controlId.endsWith(':plus') ? 0.1 : -0.1));
      return;
    }
    if (controlId.includes(':pip:')) {
      const [id, , index] = controlId.split(':');
      this.setVolume(id ?? '', (Number(index) + 1) / 10);
      return;
    }
    if (controlId.includes(':chip:')) {
      const [id, , index] = controlId.split(':');
      const row = this.controls.find((c) => c.id === id);
      const option = row?.options[Number(index)];
      if (id != null && option != null) {
        this.setChip(id, option);
      }
      return;
    }
    if (controlId === 'subtitlesOn' || controlId === 'reduceFlashing' || controlId === 'vignette' || controlId === 'debugOverlay') {
      this.toggle(controlId);
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const panel = this.panel;
    if (panel == null) {
      return;
    }
    drawPanel(ctx, panel.widthPx, panel.heightPx);
    const tabDef = TABS.find((t) => t.id === this.activeTab) ?? TABS[0];
    drawTitle(
      ctx,
      panel.widthPx,
      STRINGS.settingsTitle,
      false,
      40,
      'hex',
      tabDef?.desc ?? '',
      THEME.primary,
      40,
    );
    for (const tab of this.tabs) {
      drawControl(ctx, tab);
    }
    ctx.save();
    ctx.globalAlpha = 1 - this.tabFade * 0.45;
    for (const tab of TABS) {
      for (const c of this.rowsByTab[tab.id]) {
        if (c.kind !== 'hit') {
          drawControl(ctx, c);
        }
      }
    }
    ctx.restore();
    // Tab position dots.
    const dotsY = panel.heightPx - 92;
    for (let i = 0; i < TABS.length; i++) {
      const active = TABS[i]?.id === this.activeTab;
      ctx.fillStyle = active ? THEME.primary : THEME.panelEdge;
      ctx.beginPath();
      ctx.arc(panel.widthPx / 2 + (i - 1.5) * 18, dotsY, active ? 5 : 4, 0, Math.PI * 2);
      ctx.fill();
    }
    const back = this.controls.find((c) => c.id === 'back');
    if (back != null) {
      drawControl(ctx, back);
    }
    void withAlpha;
  }

  hitControlAt(px: number, py: number): Control | null {
    return controlAt(this.controls, px, py);
  }
}
