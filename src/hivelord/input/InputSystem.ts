import {
  BufferAttribute,
  BufferGeometry,
  createSystem,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { DEBUG, DEBUG_GESTURE_VISUALS } from '../core/config.js';
import { timeControl } from '../core/TimeControl.js';
import {
  FORCE_GESTURE_KEYS,
  FORCE_LEFT_MODIFIER_KEYS,
} from './gestureConfig.js';
import { GestureDetector } from './GestureDetector.js';
import type { GestureId } from './GestureMap.js';

const NORMAL_LINE_LENGTH = 0.09;
const FINGERTIP_RADIUS = 0.006;

let activeDetector: GestureDetector | undefined;

/**
 * The single entry point other Hivelord systems use to read gestures. It is set
 * when InputSystem initialises and cleared when the system is destroyed.
 */
export function getGestureDetector(): GestureDetector | undefined {
  return activeDetector;
}

interface HandVisual {
  thumb: Mesh;
  index: Mesh;
  normalLine: Line;
  normalPositions: Float32Array;
  normalAttribute: BufferAttribute;
}

interface ForcedGestureState {
  left: GestureId | null;
  right: GestureId | null;
  stop: boolean;
}

/**
 * Reads hand joints once per frame, runs the gesture detector and exposes the
 * dev-only forced-gesture keys and fingertip visuals.
 */
export class HivelordInputSystem extends createSystem({}) {
  private readonly detector = new GestureDetector();
  private readonly headPosition = new Vector3();
  private readonly headForward = new Vector3();
  private readonly quaternion = new Quaternion();
  private readonly handVisuals: HandVisual[] = [];
  private readonly forcedState: ForcedGestureState = {
    left: null,
    right: null,
    stop: false,
  };
  private visualsEnabled = false;

  init(): void {
    activeDetector = this.detector;
    if (DEBUG && DEBUG_GESTURE_VISUALS) {
      this.createVisuals();
    }
    this.cleanupFuncs.push(() => {
      if (activeDetector === this.detector) {
        activeDetector = undefined;
      }
      this.disposeVisuals();
    });
    console.info(
      '[Hivelord] HivelordInputSystem ready (hands, debounce, priorities, forced keys)',
    );
  }

  update(): void {
    this.readHeadPose();

    const frame = this.world.renderer.xr.getFrame();
    const referenceSpace = this.world.renderer.xr.getReferenceSpace();
    const leftSource = this.input.xr.getPrimaryInputSource('left');
    const rightSource = this.input.xr.getPrimaryInputSource('right');
    this.detector.syncInputSources(leftSource, rightSource);

    const forced = this.readForcedGestures();
    this.detector.update(
      frame,
      referenceSpace,
      timeControl.deltaTime,
      timeControl.unscaledDelta,
      this.headPosition,
      this.headForward,
      forced.left,
      forced.right,
      forced.stop,
    );

    if (this.visualsEnabled) {
      this.updateVisuals();
    }
  }

  private readHeadPose(): void {
    const immersive =
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (immersive) {
      // Joint poses from fillPoses are in the XR reference space, which is the
      // player rig's local space. Use the head-local pose so both are
      // comparable even if the rig is moved.
      const head = this.world.player.head;
      this.headPosition.copy(head.position);
      this.headForward.set(0, 0, -1).applyQuaternion(head.quaternion);
      // Project to the horizontal plane: palm-facing-forward should not depend
      // on whether the player happens to be looking down at their hands.
      this.headForward.y = 0;
      if (this.headForward.lengthSq() < 1e-6) {
        this.headForward.set(0, 0, -1);
      } else {
        this.headForward.normalize();
      }
      return;
    }
    const camera = this.world.camera;
    camera.updateWorldMatrix(true, false);
    camera.getWorldPosition(this.headPosition);
    camera.getWorldQuaternion(this.quaternion);
    this.headForward.set(0, 0, -1).applyQuaternion(this.quaternion);
  }

  private readForcedGestures(): ForcedGestureState {
    const forced = this.forcedState;
    forced.left = null;
    forced.right = null;
    forced.stop = false;

    const keyboard = this.input.keyboard;
    if (keyboard == null) {
      return forced;
    }

    let useLeft = false;
    for (let i = 0; i < FORCE_LEFT_MODIFIER_KEYS.length; i++) {
      if (keyboard.getKeyPressed(FORCE_LEFT_MODIFIER_KEYS[i])) {
        useLeft = true;
        break;
      }
    }

    for (let i = 0; i < FORCE_GESTURE_KEYS.length; i++) {
      const entry = FORCE_GESTURE_KEYS[i];
      if (!keyboard.getKeyPressed(entry.code)) {
        continue;
      }
      if (entry.gesture === 'stop') {
        forced.stop = true;
      } else if (useLeft) {
        forced.left = entry.gesture;
      } else {
        forced.right = entry.gesture;
      }
    }
    return forced;
  }

  private createVisuals(): void {
    const sphereGeometry = new SphereGeometry(FINGERTIP_RADIUS, 8, 6);
    const colors = [0x35d6ff, 0xffa23a];
    for (let i = 0; i < 2; i++) {
      const material = new MeshBasicMaterial({ color: colors[i] });
      const thumb = new Mesh(sphereGeometry, material);
      thumb.name = `hivelord-fingertip-thumb-${i}`;
      thumb.frustumCulled = false;
      thumb.visible = false;
      thumb.userData.sharedGeometry = sphereGeometry;
      this.world.createTransformEntity(thumb);

      const index = new Mesh(sphereGeometry, material);
      index.name = `hivelord-fingertip-index-${i}`;
      index.frustumCulled = false;
      index.visible = false;
      this.world.createTransformEntity(index);

      const normalPositions = new Float32Array(6);
      const normalAttribute = new BufferAttribute(normalPositions, 3);
      const geometry = new BufferGeometry();
      geometry.setAttribute('position', normalAttribute);
      const line = new Line(
        geometry,
        new LineBasicMaterial({ color: colors[i] }),
      );
      line.name = `hivelord-palm-normal-${i}`;
      line.frustumCulled = false;
      line.visible = false;
      this.world.createTransformEntity(line);

      this.handVisuals.push({
        thumb,
        index,
        normalLine: line,
        normalPositions,
        normalAttribute,
      });
    }
    this.visualsEnabled = true;
  }

  private updateVisuals(): void {
    this.updateHandVisual(0, this.detector.left.tracked, this.detector.left);
    this.updateHandVisual(1, this.detector.right.tracked, this.detector.right);
  }

  private updateHandVisual(
    index: number,
    tracked: boolean,
    hand: GestureDetector['left'],
  ): void {
    const visual = this.handVisuals[index];
    if (visual == null) {
      return;
    }
    visual.thumb.visible = tracked;
    visual.index.visible = tracked;
    visual.normalLine.visible = tracked;
    if (!tracked) {
      return;
    }
    visual.thumb.position.copy(hand.thumbTip);
    visual.index.position.copy(hand.indexTip);
    const p = visual.normalPositions;
    p[0] = hand.palmCenter.x;
    p[1] = hand.palmCenter.y;
    p[2] = hand.palmCenter.z;
    p[3] = hand.palmCenter.x + hand.palmNormal.x * NORMAL_LINE_LENGTH;
    p[4] = hand.palmCenter.y + hand.palmNormal.y * NORMAL_LINE_LENGTH;
    p[5] = hand.palmCenter.z + hand.palmNormal.z * NORMAL_LINE_LENGTH;
    visual.normalAttribute.needsUpdate = true;
  }

  private disposeVisuals(): void {
    for (let i = 0; i < this.handVisuals.length; i++) {
      const visual = this.handVisuals[i];
      const meshMaterial = visual.thumb.material as MeshBasicMaterial;
      const lineMaterial = visual.normalLine.material as LineBasicMaterial;
      meshMaterial.dispose();
      visual.normalLine.geometry.dispose();
      lineMaterial.dispose();
      const shared = visual.thumb.userData.sharedGeometry as
        | SphereGeometry
        | undefined;
      if (i === 0 && shared != null) {
        shared.dispose();
      }
    }
    this.handVisuals.length = 0;
    this.visualsEnabled = false;
  }
}
