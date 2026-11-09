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
  SettingsScreen,
  SkillsScreen,
} from './screens-system.js';
import { HUD } from './hud.js';
import { WristMenu } from './wrist.js';
import { GalleryScreen } from './gallery.js';
import { runContrastCheck } from './contrast.js';
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
  private wasImmersive = false;
  private wasBlurred = false;
  private fakeTrackingLost = false;
  private bannerPauseHeld = false;
  private prevFocus: ScreenId | null = null;
  private welcomePanel: UIKitMLAsset | null = null;

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
        () => screen.panel?.setDirty(),
      );
      this.entries.set(screen.id, { screen, hits, controlsOf });
    }

    this.hud.build(world);
    this.wrist.build(world, () => undefined);
    this.welcomePanel = world.getSceneObject<UIKitMLAsset>('welcome-panel') ?? null;

    this.cleanupFuncs.push(
      this.queries.hits.subscribe('qualify', (entity) => {
        const screenId = entity.getValue(UIHit, 'screen') as string;
        const controlId = entity.getValue(UIHit, 'control') as string;
        this.activateControl(screenId, controlId);
      }),
      gameState.onEnter(GameStates.Boot, () => {
        this.loadT = 0;
        this.manager.show('loading');
      }),
      gameState.onEnter(GameStates.Menu, () => this.manager.show('start')),
      gameState.onEnter(GameStates.Playing, () => this.manager.hideAll()),
      gameState.onEnter(GameStates.Paused, () => this.manager.show('pause')),
      gameState.onEnter(GameStates.ChapterEnd, () => this.manager.show('chapter')),
      gameState.onEnter(GameStates.Error, () => this.manager.show('error')),
      hivelordEvents.on('TrackingLost', () => this.refreshTrackingBanner()),
      hivelordEvents.on('TrackingRestored', () => this.refreshTrackingBanner()),
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

  private placeFocusedScreen(): void {    const focus = this.manager.focus();
    if (focus == null) {
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
    for (const other of this.entries.values()) {
      if (other !== entry) {
        layoutHitMeshes(other.hits, panel.mesh, false);
      }
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
    if (control == null || !control.enabled) {
      return;
    }
    this.setCooldown(screenId, controlId);
    control.pressed = true;
    screen.panel?.setDirty();
    hivelordEvents.emit('ButtonPressed', { id: controlId, screen: screenId });
    uiSounds.press();
    this.activateScreen(screenId as ScreenId, controlId);
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

  private activateScreen(screenId: ScreenId, controlId: string): void {
    const entry = this.entries.get(screenId);
    if (entry == null) {
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
              (c.kind === 'button' || c.kind === 'toggle' || c.kind === 'hit'),
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
      if (this.welcomePanel != null) {
        this.welcomePanel.visible = false;
      }
      // The head pose changes when the immersive session starts; re-place the
      // focused screen so it is not left at the browser camera pose.
      this.placeFocusedScreen();
    }
    if (!immersive && this.wasImmersive) {
      if (this.welcomePanel != null) {
        this.welcomePanel.visible = true;
      }
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
      }
    }

    if (focus === 'loading') {
      this.loadT += delta;
      const entry = this.entries.get('loading');
      const screen = entry?.screen;
      if (screen instanceof LoadingScreen) {
        screen.setProgress(Math.min(1, this.loadT / 1.5), STRINGS.loadingTitle);
      }
      if (this.loadT >= 1.5) {
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
