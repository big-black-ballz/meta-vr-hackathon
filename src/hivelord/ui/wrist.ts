import { Quaternion, Vector3 } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import type { GestureDetector } from '../input/GestureDetector.js';
import type { HandId } from '../input/GestureMap.js';
import { CanvasPanel } from './screen.js';
import { drawChrome, drawControl, makeControl, type Control } from './controls.js';
import { STRINGS } from './strings.js';
import { THEME } from './theme.js';
import { settings } from './settings.js';
import { buildHitMeshes, layoutHitMeshes, type HitRecord } from './hits.js';

const PALM_FACE_DOT = 0.7;
const GAZE_DEG = 30;
const GAZE_LOSS_SECONDS = 0.5;
const PANEL_W_M = 0.3;
const PANEL_H_M = 0.38;

const tmpToHead = new Vector3();
const tmpToHand = new Vector3();
const tmpFwd = new Vector3();

/**
 * Wrist menu anchored near the NON-dominant wrist. Opens when that palm
 * faces the player's face (dot above ~0.7) while the player looks at the
 * hand (within ~30 deg). Deliberately NOT the palm-up pose: palm-up is the
 * Cupped gesture for Scout. Non-blocking: the other hand keeps its
 * gameplay gestures until a button is poked.
 */
export class WristMenu {
  controls: Control[] = [];
  hits: HitRecord[] = [];
  panel: CanvasPanel | null = null;
  open = false;
  private forced = false;
  private gazeLoss = 0;

  build(
    world: World,
    onDirty: (control: Control, hover: boolean) => void,
  ): void {
    this.panel = new CanvasPanel(world, 'hivelord-ui-wrist', PANEL_W_M, PANEL_H_M);
    const w = this.panel.widthPx;
    const ids = ['pause', 'skills', 'settings', 'recenter', 'togglehud'];
    const labels = [
      STRINGS.wristPause,
      STRINGS.wristSkills,
      STRINGS.wristSettings,
      STRINGS.wristRecenter,
      STRINGS.wristToggleHud,
    ];
    let y = 108;
    for (let i = 0; i < ids.length; i++) {
      const id = ids[i] ?? '';
      if (id === 'togglehud') {
        const toggle = makeControl(id, 'toggle', 32, y, w - 64, 56, labels[i] ?? '');
        toggle.value = settings.get('hudVisible');
        this.controls.push(toggle);
      } else {
        this.controls.push(
          makeControl(id, 'button', 32, y, w - 64, 56, labels[i] ?? ''),
        );
      }
      y += 56 + 12;
    }
    this.hits = buildHitMeshes(world, 'wrist', w, this.panel.heightPx, this.controls, onDirty);
    void THEME;
  }

  toggleForced(): void {
    this.forced = !this.forced;
  }

  isForced(): boolean {
    return this.forced;
  }

  update(
    _dt: number,
    headPos: Vector3,
    headQuat: Quaternion,
    detector: GestureDetector | null,
  ): void {
    void _dt;
    let shouldOpen = this.forced;
    if (!shouldOpen && detector != null) {
      const dominant = detector.getDominantHand() ?? 'right';
      const nonDominant: HandId = dominant === 'left' ? 'right' : 'left';
      const hand = nonDominant === 'left' ? detector.left : detector.right;
      if (hand.tracked) {
        tmpToHead.copy(headPos).sub(hand.palmCenter).normalize();
        const facing = hand.palmNormal.dot(tmpToHead);
        tmpToHand.copy(hand.palmCenter).sub(headPos).normalize();
        tmpFwd.set(0, 0, -1).applyQuaternion(headQuat);
        const gazeDot = tmpToHand.dot(tmpFwd);
        const gazeLimit = Math.cos((GAZE_DEG * Math.PI) / 180);
        const looking = gazeDot > gazeLimit;
        if (facing > PALM_FACE_DOT && looking) {
          shouldOpen = true;
          this.gazeLoss = 0;
        } else if (this.open && !this.forced) {
          if (!looking) {
            this.gazeLoss += 1 / 60;
          } else {
            this.gazeLoss = 0;
          }
          shouldOpen = facing > PALM_FACE_DOT && this.gazeLoss < GAZE_LOSS_SECONDS;
        }
      } else if (this.open && !this.forced) {
        shouldOpen = false;
      }
    }
    this.open = shouldOpen;
    if (this.panel == null || detector == null) {
      return;
    }
    const hudToggle = this.controls.find((c) => c.id === 'togglehud');
    if (hudToggle != null) {
      const visible = settings.get('hudVisible');
      if (hudToggle.value !== visible) {
        hudToggle.value = visible;
        this.panel.setDirty();
      }
    }
    this.panel.setVisible(this.open);
    layoutHitMeshes(this.hits, this.panel.mesh, this.open);
    if (!this.open) {
      return;
    }
    const dominant = detector.getDominantHand() ?? 'right';
    const nonDominant: HandId = dominant === 'left' ? 'right' : 'left';
    const hand = nonDominant === 'left' ? detector.left : detector.right;
    this.panel.mesh.position.copy(hand.palmCenter).addScaledVector(tmpToHead.copy(hand.palmNormal), 0.035);
    this.panel.mesh.quaternion.copy(headQuat);
  }

  draw(): void {
    if (this.panel == null) {
      return;
    }
    this.panel.render((ctx) => {
      drawChrome(ctx, this.panel?.widthPx ?? 0, this.panel?.heightPx ?? 0, 'Wrist');
      for (const c of this.controls) {
        drawControl(ctx, c);
      }
    });
  }
}
