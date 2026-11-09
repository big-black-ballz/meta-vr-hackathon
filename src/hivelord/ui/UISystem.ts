import {
  createSystem,
  Pressed,
  Quaternion,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { DEBUG } from '../core/config.js';
import { GameStates, gameState } from '../core/GameState.js';
import { hivelordEvents } from '../core/EventBus.js';
import { timeControl } from '../core/TimeControl.js';
import { getGestureDetector } from '../input/InputSystem.js';
import { getInputContext, UIManager } from './UIManager.js';
import type { ScreenId } from './screen.js';
import type { UIScreen } from './screen.js';
import { UIHit } from './UIHitComponent.js';
import { buildHitMeshes, layoutHitMeshes, type HitRecord } from './hits.js';
import {
  consumeRecenterRequest,
  placeInView,
  recenter,
} from './placement.js';
import { ChapterScreen, LoadingScreen, StartScreen } from './screens-menu.js';
import {
  ConfirmScreen,
  ErrorScreen,
  PauseScreen,
} from './screens-system.js';
import { SettingsScreen } from './settingsScreen.js';
import { SkillsScreen } from './skillsScreen.js';
import { HUD } from './hud.js';
import { WristMenu } from './wrist.js';
import { GalleryScreen } from './gallery.js';
import { runContrastCheck } from './contrast.js';
import { isReady } from '../assets/AssetManager.js';
import { OrnamentPlate, ShadowPlate, HoverSweep, type OrnamentKind } from './draw/depth.js';
import { settings } from './settings.js';
import { setMasterVolume, uiSounds } from './sounds.js';
import { setHighContrast, setPanelOpacity, THEME } from './theme.js';
import { getPlaceholderSkills, unlockSkill } from './placeholderSkills.js';
import {
  setErrorMessage,
  setPendingConfirm,
} from './UIManager.js';
import { STRINGS } from './strings.js';
import { hidePresession, showPresession } from './presession.js';
import type { Control } from './controls.js';

const POKE_RADIUS_M = 0.025;
const POKE_RELEASE_M = 0.04;
const PRESS_DWELL_S = 0.08;
const PRESS_COOLDOWN_S = 0.25;
const PANEL_DISTANCE_M = 0.8;

const headPos = new Vector3();
const headQuat = new Quaternion();
const tipWorld = new Vector3();
const hitWorld = new Vector3();

export interface UIStateSummary {
  screen: string;
  context: string;
  dominant: string;
  quality: string;
  hud: boolean;
}

let uiSummary: UIStateSummary = {
  screen: 'none',
  context: 'gameplay',
  dominant: 'auto',
  quality: 'medium',
  hud: true,
};

export function getUIState(): UIStateSummary {
  return uiSummary;
}

interface ScreenEntry {
  screen: UIScreen;
  hits: HitRecord[];
  controlsOf: () => Control[];
}

/**
 * Owns every UI surface: blocking screens, HUD widgets and the wrist menu.
 * All animation and timers use UNSCALED delta time so menus stay alive while
 * game time is paused. Gameplay-gesture suspension is driven through the
 * input context (see UIManager); this system never touches detection itself.
 */
export class UISystem extends createSystem({
  hits: { required: [UIHit, Pressed] },
}) {
  private manager = new UIManager();
  private entries = new Map<ScreenId, ScreenEntry>();
  private hud = new HUD();
  private wrist = new WristMenu();
  private uiTime = 0;
  private loadT = 0;
  private bootProgress = 0;
  private pendingBegin = false;
  private wasImmersive = false;
  private wasBlurred = false;
  private fakeTrackingLost = false;
  private bannerPauseHeld = false;
  private prevFocus: ScreenId | null = null;
  private welcomePanel: UIKitMLAsset | null = null;
  private welcomeDocument: { visible: boolean } | null = null;
  private welcomeObject: { visible: boolean } | null = null;
  private shadowPlate: ShadowPlate | null = null;
  private ornamentPlate: OrnamentPlate | null = null;
  private hoverSweep: HoverSweep | null = null;
  private hoveredControl: Control | null = null;
  private animT = 1;
  private animActive = false;
  private readonly animBase = new Vector3();

  init(): void {
    settings.load();
    setHighContrast(settings.get('highContrast'));
    if (!settings.get('highContrast')) {
      setPanelOpacity(settings.get('uiOpacity'));
    }
    setMasterVolume(settings.get('master'));
    const detector = getGestureDetector();
    if (detector != null) {
      detector.setDominantHand(settings.get('dominantHand'));
    }

    const world = this.world;
    const start = new StartScreen();
    const loading = new LoadingScreen();
    const chapter = new ChapterScreen();
    const pause = new PauseScreen();
    const settingsScreen = new SettingsScreen();
    const skills = new SkillsScreen();
    const confirm = new ConfirmScreen();
    const error = new ErrorScreen();
    const gallery = new GalleryScreen();
    const screens: UIScreen[] = [
      start,
      loading,
      chapter,
      pause,
      settingsScreen,
      skills,
      confirm,
      error,
      gallery,
    ];
    const withControls = new Map<ScreenId, () => Control[]>([
      ['start', () => start.controls],
      ['loading', () => loading.controls],
      ['chapter', () => chapter.controls],
      ['pause', () => pause.controls],
      ['settings', () => settingsScreen.controls],
      ['skills', () => skills.controls],
      ['confirm', () => confirm.controls],
      ['error', () => error.controls],
      ['gallery', () => gallery.controls],
    ]);
    for (const screen of screens) {
      screen.build(world);
      this.manager.register(screen);
      const controlsOf = withControls.get(screen.id) ?? (() => []);
      const hits = buildHitMeshes(
        world,
        screen.id,
        screen.panel?.widthPx ?? 640,
        screen.panel?.heightPx ?? 480,
        controlsOf(),
        (control, hover) => {
          screen.panel?.setDirty();
          this.hoverChanged(screen.id, control, hover);
        },
      );
      this.entries.set(screen.id, { screen, hits, controlsOf });
    }

    this.hud.build(world);
    this.wrist.build(world, () => undefined);
    this.welcomePanel = world.getSceneObject<UIKitMLAsset>('welcome-panel') ?? null;
    this.welcomeDocument =
      (this.welcomePanel?.document as unknown as { visible: boolean } | undefined) ??
      null;
    this.welcomeObject =
      (world.scene.getObjectByName('Welcome Panel') as
        | { visible: boolean }
        | undefined) ?? null;
    this.shadowPlate = new ShadowPlate(world);
    this.ornamentPlate = new OrnamentPlate(world);
    this.hoverSweep = new HoverSweep(world);

    this.cleanupFuncs.push(
      this.queries.hits.subscribe('qualify', (entity) => {
        const screenId = entity.getValue(UIHit, 'screen') as string;
        const controlId = entity.getValue(UIHit, 'control') as string;
        this.activateControl(screenId, controlId);
      }),
      gameState.onEnter(GameStates.Boot, () => {
        this.loadT = 0;
        this.bootProgress = 0;
        this.manager.show('loading');
      }),
      gameState.onEnter(GameStates.Menu, () => {
        this.pendingBegin = false;
        this.manager.show('start');
        this.syncBeginButton();
      }),
      gameState.onEnter(GameStates.Playing, () => this.manager.hideAll()),
      gameState.onEnter(GameStates.Paused, () => this.manager.show('pause')),
      gameState.onEnter(GameStates.ChapterEnd, () => this.manager.show('chapter')),
      gameState.onEnter(GameStates.Error, () => this.manager.show('error')),
      hivelordEvents.on('TrackingLost', () => this.refreshTrackingBanner()),
      hivelordEvents.on('TrackingRestored', () => this.refreshTrackingBanner()),
      hivelordEvents.on('AssetProgress', ({ group, loaded, total }) => {
        if (group === 'boot' && total > 0) {
          this.bootProgress = Math.max(0, Math.min(1, loaded / total));
        }
      }),
      hivelordEvents.on('AssetGroupLoaded', ({ group }) => {
        if (group !== 'chapter1') {
          return;
        }
        this.syncBeginButton();
        if (
          this.pendingBegin &&
          gameState.getState() === GameStates.Menu &&
          isReady('chapter1')
        ) {
          this.pendingBegin = false;
          gameState.setState(GameStates.Playing, 'chapter ready');
        }
      }),
      hivelordEvents.on('SettingChanged', ({ key, value }) => {
        if (key === 'dominantHand' && typeof value === 'string') {
          getGestureDetector()?.setDominantHand(
            value as 'left' | 'right' | 'auto',
          );
        }
        if (key === 'master' && typeof value === 'number') {
          setMasterVolume(value);
        }
        if (key === 'uiOpacity') {
          setHighContrast(settings.get('highContrast'));
          if (!settings.get('highContrast')) {
            setPanelOpacity(settings.get('uiOpacity'));
          }
          this.redrawAllPanels();
        }
        if (key === 'highContrast') {
          setHighContrast(settings.get('highContrast'));
          if (!settings.get('highContrast')) {
            setPanelOpacity(settings.get('uiOpacity'));
          }
          this.redrawAllPanels();
        }
      }),
    );
    document.addEventListener('visibilitychange', this.onDocVisibility);
    this.cleanupFuncs.push(() =>
      document.removeEventListener('visibilitychange', this.onDocVisibility),
    );
    console.info('[Hivelord] UISystem ready');
    console.info(
      `[Hivelord] UI opacity ${THEME.panelOpacity.toFixed(2)} highContrast ${THEME.highContrast}`,
    );
    if (DEBUG) {
      runContrastCheck();
    }
  }

  private onDocVisibility = (): void => {
    if (document.hidden && gameState.getState() === GameStates.Playing) {
      gameState.setState(GameStates.Paused, 'page hidden');
    }
  };

  private readHead(world: World): void {
    const immersive =
      world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (immersive) {
      const head = world.player.head;
      headPos.copy(head.position);
      headQuat.copy(head.quaternion);
      return;
    }
    const camera = world.camera;
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(headPos);
    camera.getWorldQuaternion(headQuat);
  }

  private redrawAllPanels(): void {
    for (const entry of this.entries.values()) {
      entry.screen.panel?.setDirty();
    }
    this.wrist.panel?.setDirty();
    this.hud.markDirty();
  }

  private placeFocusedScreen(): void {
    const focus = this.manager.focus();
    if (focus == null) {
      this.shadowPlate?.hide();
      this.ornamentPlate?.hide();
      return;
    }
    const entry = this.entries.get(focus);
    const panel = entry?.screen.panel;
    if (entry == null || panel == null) {
      return;
    }
    placeInView(
      panel.mesh.position,
      panel.mesh.quaternion,
      headPos,
      headQuat,
      PANEL_DISTANCE_M,
      0,
      0.02,
    );
    panel.mesh.updateWorldMatrix(true, false);
    layoutHitMeshes(entry.hits, panel.mesh, true);
    this.updateDepthLayers(entry);
    for (const other of this.entries.values()) {
      if (other !== entry) {
        layoutHitMeshes(other.hits, panel.mesh, false);
      }
    }
  }

  private setWelcomeVisible(visible: boolean): void {
    if (this.welcomePanel != null) {
      this.welcomePanel.visible = visible;
    }
    if (this.welcomeDocument != null) {
      this.welcomeDocument.visible = visible;
    }
    if (this.welcomeObject != null) {
      this.welcomeObject.visible = visible;
    }
  }

  private updateDepthLayers(entry: ScreenEntry): void {
    const panel = entry.screen.panel;
    if (panel == null || this.shadowPlate == null || this.ornamentPlate == null) {
      return;
    }
    this.shadowPlate.setPose(
      panel.mesh.position,
      panel.mesh.quaternion,
      panel.widthM,
      panel.heightM,
    );
    if (entry.screen.id === 'start') {
      this.ornamentPlate.setKind('crest');
      this.ornamentPlate.setPose(
        panel.mesh.position,
        panel.mesh.quaternion,
        panel.widthM,
        panel.heightM,
        true,
      );
      return;
    }
    if (entry.screen.id === 'chapter') {
      this.ornamentPlate.setKind('crown');
      this.ornamentPlate.setPose(
        panel.mesh.position,
        panel.mesh.quaternion,
        panel.widthM,
        panel.heightM,
        true,
      );
      return;
    }
    this.ornamentPlate.hide();
  }

  private ornamentFor(id: ScreenId): OrnamentKind {
    switch (id) {
      case 'start':
        return 'crest';
      case 'chapter':
        return 'crown';
      case 'pause':
        return 'pause';
      case 'error':
        return 'warning';
      default:
        return 'hex';
    }
  }

  private hoverChanged(
    screenId: ScreenId,
    control: Control,
    hover: boolean,
  ): void {
    if (!hover) {
      if (this.hoveredControl === control) {
        this.hoveredControl = null;
        this.hoverSweep?.hide();
      }
      return;
    }
    if (settings.get('reduceFlashing') || this.manager.focus() !== screenId) {
      return;
    }
    const entry = this.entries.get(screenId);
    const panel = entry?.screen.panel;
    if (entry == null || panel == null) {
      return;
    }
    this.hoveredControl = control;
    this.hoverSweep?.start(
      panel.mesh,
      control,
      panel.widthPx,
      panel.heightPx,
    );
  }

  private startEntrance(entry: ScreenEntry): void {
    const panel = entry.screen.panel;
    if (panel == null) {
      return;
    }
    if (settings.get('reduceFlashing')) {
      panel.mesh.scale.set(1, 1, 1);
      panel.setOpacity(1);
      this.animActive = false;
      return;
    }
    this.animT = 0;
    this.animActive = true;
    this.animBase.copy(panel.mesh.position);
    panel.mesh.scale.set(0.96, 0.96, 0.96);
    panel.setOpacity(0.2);
  }

  private updateEntrance(dt: number): void {
    if (!this.animActive) {
      return;
    }
    const focus = this.manager.focus();
    const entry = focus != null ? this.entries.get(focus) : undefined;
    const panel = entry?.screen.panel;
    if (entry == null || panel == null) {
      this.animActive = false;
      return;
    }
    this.animT = Math.min(1, this.animT + dt / 0.18);
    const eased = 1 - Math.pow(1 - this.animT, 3);
    const scale = 0.96 + 0.04 * eased;
    panel.mesh.scale.set(scale, scale, scale);
    panel.mesh.position.copy(this.animBase);
    panel.mesh.position.y += 0.006 * (1 - eased);
    panel.setOpacity(eased);
    panel.mesh.updateWorldMatrix(true, false);
    layoutHitMeshes(entry.hits, panel.mesh, true);
    this.updateDepthLayers(entry);
    if (this.animT >= 1) {
      panel.mesh.scale.set(1, 1, 1);
      panel.mesh.position.copy(this.animBase);
      panel.setOpacity(1);
      panel.mesh.updateWorldMatrix(true, false);
      layoutHitMeshes(entry.hits, panel.mesh, true);
      this.updateDepthLayers(entry);
      this.animActive = false;
    }
  }

  private activateControl(screenId: string, controlId: string): void {
    if (this.uiTime < this.cooldownOf(screenId, controlId)) {
      return;
    }
    if (screenId === 'wrist') {
      if (!this.wrist.open) {
        return;
      }
      const control = this.wrist.controls.find((c) => c.id === controlId);
      if (control == null || !control.enabled) {
        return;
      }
      this.setCooldown(screenId, controlId);
      hivelordEvents.emit('ButtonPressed', { id: controlId, screen: 'wrist' });
      uiSounds.press();
      this.activateWrist(controlId);
      this.wrist.draw();
      return;
    }
    const entry = this.entries.get(screenId as ScreenId);
    const screen = entry?.screen;
    if (entry == null || screen == null || !screen.visible) {
      return;
    }
    if (this.manager.focus() !== screenId) {
      return;
    }
    const control = entry.controlsOf().find((c) => c.id === controlId);
    if (control == null || !control.enabled || control.hidden) {
      return;
    }
    this.setCooldown(screenId, controlId);
    control.pressed = true;
    screen.panel?.setDirty();
    hivelordEvents.emit('ButtonPressed', { id: controlId, screen: screenId });
    uiSounds.press();
    this.activateScreen(screenId as ScreenId, controlId);
    if (screen.panel != null) {
      screen.panel.mesh.updateWorldMatrix(true, false);
      layoutHitMeshes(entry.hits, screen.panel.mesh, true);
    }
    screen.panel?.setDirty();
  }

  private cooldowns = new Map<string, number>();

  private cooldownOf(screenId: string, controlId: string): number {
    return this.cooldowns.get(`${screenId}:${controlId}`) ?? 0;
  }

  private setCooldown(screenId: string, controlId: string): void {
    this.cooldowns.set(`${screenId}:${controlId}`, this.uiTime + PRESS_COOLDOWN_S);
  }

  private activateWrist(controlId: string): void {
    switch (controlId) {
      case 'pause':
        if (gameState.getState() === GameStates.Playing) {
          gameState.setState(GameStates.Paused, 'wrist menu');
        }
        break;
      case 'skills':
        this.manager.show('skills');
        break;
      case 'settings':
        this.manager.show('settings');
        break;
      case 'recenter':
        recenter();
        hivelordEvents.emit('ToastRequested', {
          text: STRINGS.toastRecentered,
          kind: 'info',
        });
        break;
      case 'togglehud':
        settings.set('hudVisible', !settings.get('hudVisible'));
        hivelordEvents.emit('ToastRequested', {
          text: settings.get('hudVisible')
            ? STRINGS.toastHudOn
            : STRINGS.toastHudOff,
          kind: 'info',
        });
        break;
      default:
        break;
    }
  }

  private syncBeginButton(): void {
    const entry = this.entries.get('start');
    const screen = entry?.screen;
    if (screen instanceof StartScreen) {
      // Begin stays enabled while loading so the press can park as
      // pendingBegin; the label communicates the wait instead.
      if (isReady('chapter1')) {
        screen.setBeginState(STRINGS.startBegin, true);
      } else {
        screen.setBeginState(STRINGS.startLoadingChapter, true);
      }
    }
  }

  private activateScreen(screenId: ScreenId, controlId: string): void {
    const entry = this.entries.get(screenId);
    if (entry == null) {
      return;
    }
    if (screenId === 'start' && controlId === 'begin' && !isReady('chapter1')) {
      this.pendingBegin = true;
      const screen = entry.screen;
      if (screen instanceof StartScreen) {
        screen.setBeginState(STRINGS.startLoadingChapter, false);
      }
      hivelordEvents.emit('ToastRequested', {
        text: STRINGS.startLoadingChapter,
        kind: 'info',
      });
      return;
    }
    switch (controlId) {
      case 'settings':
        this.manager.show('settings');
        return;
      case 'skills':
        this.manager.show('skills');
        return;
      case 'back':
        this.manager.back();
        return;
      case 'restart':
        setPendingConfirm({
          title: STRINGS.confirmTitle,
          message: STRINGS.confirmRestartMsg,
          destructive: true,
          onConfirm: () => {
            gameState.setState('Playing', 'restart chapter');
            hivelordEvents.emit('ToastRequested', {
              text: STRINGS.toastRestarted,
              kind: 'info',
            });
          },
        });
        this.manager.show('confirm');
        return;
      case 'reset':
        setPendingConfirm({
          title: STRINGS.confirmTitle,
          message: STRINGS.confirmResetMsg,
          destructive: true,
          onConfirm: () => {
            settings.clear();
            setMasterVolume(settings.get('master'));
            hivelordEvents.emit('ToastRequested', {
              text: STRINGS.toastProgressReset,
              kind: 'success',
            });
            this.manager.back();
          },
        });
        this.manager.show('confirm');
        return;
      case 'confirm':
        entry.screen.onControl(controlId);
        if (this.manager.focus() === 'confirm') {
          this.manager.back();
        }
        return;
      case 'cancel':
        entry.screen.onControl(controlId);
        this.manager.back();
        return;
      default:
        entry.screen.onControl(controlId);
        return;
    }
  }

  private refreshTrackingBanner(): void {
    const detector = getGestureDetector();
    const inGame = gameState.getState() === GameStates.Playing;
    let lost = this.fakeTrackingLost;
    if (!lost && detector != null && inGame) {
      const dominant = detector.getDominantHand();
      const leftLost = !detector.left.tracked;
      const rightLost = !detector.right.tracked;
      lost =
        (leftLost && rightLost) ||
        (dominant != null &&
          (dominant === 'left' ? leftLost : rightLost));
    }
    this.hud.setBannerVisible(lost && inGame);
    if (lost && inGame && !this.bannerPauseHeld) {
      this.bannerPauseHeld = true;
      timeControl.pause();
    } else if ((!lost || !inGame) && this.bannerPauseHeld) {
      this.bannerPauseHeld = false;
      if (gameState.getState() !== GameStates.Paused) {
        timeControl.resume();
      }
    }
  }

  private pokeHits(dt: number, records: HitRecord[], detector: {
    left: { tracked: boolean; indexTip: Vector3 };
    right: { tracked: boolean; indexTip: Vector3 };
  }): void {
    const hands = [detector.left, detector.right];
    for (const record of records) {
      if (!record.visible || !record.control.enabled) {
        continue;
      }
      record.mesh.getWorldPosition(hitWorld);
      let near = false;
      for (const hand of hands) {
        if (!hand.tracked) {
          continue;
        }
        tipWorld.copy(hand.indexTip).applyMatrix4(this.world.player.matrixWorld);
        if (tipWorld.distanceTo(hitWorld) < POKE_RADIUS_M) {
          near = true;
          break;
        }
      }
      if (near) {
        if (record.armed) {
          record.dwell += dt;
          if (record.dwell >= PRESS_DWELL_S) {
            record.armed = false;
            record.dwell = 0;
            this.activateControl(record.screenId, record.control.id);
          }
        }
      } else {
        record.dwell = 0;
        if (tipWorld.distanceTo(hitWorld) > POKE_RELEASE_M) {
          record.armed = true;
        }
      }
    }
  }

  private devKeys(): void {
    const keyboard = this.input.keyboard;
    if (keyboard == null) {
      return;
    }
    const down = (code: string): boolean => keyboard.getKeyDown(code) === true;
    // Digits drive the focused blocking screen only. With no blocking
    // screen they belong to the Level 1 forced-gesture keys (gameplay),
    // so the wrist menu uses F1-F5 to avoid stealing gameplay input.
    const focus = this.manager.focus();
    if (focus != null) {
      if (down('KeyB')) {
        this.pressPrimary();
      }
      for (let i = 0; i < 9; i++) {
        if (down(`Digit${i + 1}`)) {
          this.pressNth(i);
        }
      }
    } else {
      if (down('KeyB')) {
        this.pressPrimary();
      }
      const wristKeys = ['F1', 'F2', 'F3', 'F4', 'F5'];
      for (let i = 0; i < wristKeys.length; i++) {
        if (down(wristKeys[i] ?? '')) {
          const control = this.wrist.controls[i];
          if (control != null && this.wrist.open) {
            this.activateControl('wrist', control.id);
          }
        }
      }
    }
    if (down('KeyQ')) {
      this.manager.show('start');
    }
    if (down('KeyW')) {
      const state = gameState.getState();
      if (state === GameStates.Playing) {
        gameState.setState(GameStates.Paused, 'dev key');
      } else if (state === GameStates.Paused) {
        gameState.setState(GameStates.Playing, 'dev key');
      }
    }
    if (down('KeyE')) {
      this.manager.show('settings');
    }
    if (down('KeyR')) {
      this.manager.show('skills');
    }
    if (down('KeyT')) {
      hivelordEvents.emit('ToastRequested', {
        text: 'Dev toast: objective updated.',
        kind: 'success',
      });
    }
    if (down('KeyY')) {
      hivelordEvents.emit('SubtitleRequested', {
        speaker: STRINGS.subtitleSpeaker,
        text: 'Dev subtitle: the swarm stirs beneath the floor.',
      });
    }
    if (down('KeyU')) {
      hivelordEvents.emit('ObjectiveChanged', {
        text: 'Dev objective: hold a cupped palm.',
      });
    }
    if (down('KeyI')) {
      this.hud.testCooldowns(5);
      this.hud.setStun(0.6, true);
      this.hud.setCharge(1);
    }
    if (down('KeyO')) {
      const next = getPlaceholderSkills().find((s) => !s.unlocked);
      if (next != null && unlockSkill(next.id)) {
        hivelordEvents.emit('ToastRequested', {
          text: `${STRINGS.toastSkillUnlocked} ${next.name}`,
          kind: 'success',
        });
      }
    }
    if (down('KeyG')) {
      this.manager.show('gallery');
    }
    if (down('KeyZ')) {
      this.manager.show('loading');
    }
    if (down('KeyV')) {
      runContrastCheck();
    }
    if (down('KeyN')) {
      const order = [0.8, 0.88, 0.95];
      const index = order.findIndex(
        (v) => Math.abs(v - settings.get('uiOpacity')) < 0.001,
      );
      const next = order[(index + 1) % 3] ?? 0.88;
      settings.set('uiOpacity', next);
    }
    if (down('KeyM')) {
      settings.set('highContrast', !settings.get('highContrast'));
    }
    if (down('KeyJ')) {
      this.wrist.toggleForced();
    }
    if (down('KeyK')) {
      this.fakeTrackingLost = !this.fakeTrackingLost;
      this.refreshTrackingBanner();
    }
    if (down('KeyL')) {
      setErrorMessage('Dev error: simulated runtime failure.');
      gameState.setState(GameStates.Error, 'dev key');
    }
    if (down('KeyC')) {
      if (gameState.getState() === GameStates.Playing) {
        gameState.setState(GameStates.ChapterEnd, 'dev key');
      }
    }
  }

  private actionableControls(): Control[] {
    const focus = this.manager.focus();
    if (focus != null) {
      const entry = this.entries.get(focus);
      if (entry != null) {
        return entry
          .controlsOf()
          .filter(
            (c) =>
              c.enabled &&
              !c.hidden &&
              (c.kind === 'button' ||
                c.kind === 'toggle' ||
                c.kind === 'tab' ||
                c.kind === 'hit'),
          );
      }
    }
    if (this.wrist.open) {
      return this.wrist.controls.filter((c) => c.enabled);
    }
    return [];
  }

  private pressPrimary(): void {
    const list = this.actionableControls();
    const first = list.find((c) => c.defaultFocus);
    if (first == null) {
      return;
    }
    const focus = this.manager.focus();
    this.activateControl(focus ?? 'wrist', first.id);
  }

  private pressNth(index: number): void {
    const list = this.actionableControls();
    const control = list[index];
    if (control == null) {
      return;
    }
    const focus = this.manager.focus();
    this.activateControl(focus ?? 'wrist', control.id);
  }

  update(delta: number): void {
    const world = this.world;
    this.uiTime += delta;
    this.readHead(world);

    const immersive =
      world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (immersive && !this.wasImmersive) {
      hidePresession();
      this.setWelcomeVisible(false);
      // The head pose changes when the immersive session starts; re-place the
      // focused screen so it is not left at the browser camera pose.
      this.placeFocusedScreen();
    }
    if (!immersive && this.wasImmersive) {
      this.setWelcomeVisible(true);
      if (
        gameState.getState() === GameStates.Playing ||
        gameState.getState() === GameStates.Paused
      ) {
        showPresession();
      }
    }
    const blurred =
      world.visibilityState.peek() === VisibilityState.VisibleBlurred;
    if (blurred && !this.wasBlurred && gameState.getState() === GameStates.Playing) {
      gameState.setState(GameStates.Paused, 'session blurred');
    }
    this.wasImmersive = immersive;
    this.wasBlurred = blurred;

    if (DEBUG) {
      this.devKeys();
    }

    if (consumeRecenterRequest()) {
      this.placeFocusedScreen();
    }
    const focus = this.manager.focus();
    if (focus !== this.prevFocus) {
      this.prevFocus = focus;
      if (focus != null) {
        this.placeFocusedScreen();
        const entry = this.entries.get(focus);
        if (entry != null) {
          this.startEntrance(entry);
        }
      } else {
        this.shadowPlate?.hide();
        this.ornamentPlate?.hide();
        this.hoverSweep?.hide();
      }
    }
    this.updateEntrance(delta);
    this.hoverSweep?.update(delta);
    if (this.ornamentPlate != null) {
      const focusNow = this.manager.focus();
      if (focusNow === 'start') {
        const pulse =
          settings.get('reduceFlashing')
            ? 1
            : 0.78 + 0.22 * (0.5 + 0.5 * Math.sin(this.uiTime * 1.4));
        this.ornamentPlate.setOpacity(pulse);
      } else {
        this.ornamentPlate.setOpacity(1);
      }
    }
    if (this.welcomePanel != null || this.welcomeObject != null) {
      this.setWelcomeVisible(
        !immersive && focus == null && gameState.getState() === GameStates.Boot,
      );
    }

    if (focus === 'loading') {
      this.loadT += delta;
      const entry = this.entries.get('loading');
      const screen = entry?.screen;
      if (screen instanceof LoadingScreen) {
        screen.setProgress(this.bootProgress, STRINGS.loadingTitle);
      }
      if (this.loadT >= 1.5 && isReady('boot')) {
        gameState.setState(GameStates.Menu, 'loading complete');
      }
    }

    this.manager.update(delta);

    const state = gameState.getState();
    const inGame = state === GameStates.Playing;
    const detector = getGestureDetector() ?? null;
    this.hud.update(delta, headPos, headQuat, detector, inGame || state === GameStates.Paused);
    this.wrist.update(delta, headPos, headQuat, detector);
    this.wrist.draw();

    const entry = focus != null ? this.entries.get(focus) : undefined;
    entry?.screen.panel?.render((ctx) => entry.screen.draw(ctx));

    if (detector != null && immersive) {
      const pokeTarget =
        focus != null ? this.entries.get(focus) : undefined;
      if (pokeTarget != null) {
        this.pokeHits(delta, pokeTarget.hits, detector);
      }
      if (this.wrist.open) {
        this.pokeHits(delta, this.wrist.hits, detector);
      }
    }

    const snap = settings.snapshot();
    uiSummary = {
      screen: focus ?? 'none',
      context: getInputContext(),
      dominant: snap.dominantHand,
      quality: snap.quality,
      hud: snap.hudVisible,
    };
    void uiSounds;
  }
}
