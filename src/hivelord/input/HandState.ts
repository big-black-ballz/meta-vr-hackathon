import { Vector3 } from '@iwsdk/core';
import { GESTURE_CONFIG } from './gestureConfig.js';
import type { HandId } from './GestureMap.js';

/** WebXR hand joints in a fixed order so transforms can be read in one batch. */
export const HAND_JOINT_NAMES = [
  'wrist',
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  'index-finger-metacarpal',
  'index-finger-phalanx-proximal',
  'index-finger-phalanx-intermediate',
  'index-finger-phalanx-distal',
  'index-finger-tip',
  'middle-finger-metacarpal',
  'middle-finger-phalanx-proximal',
  'middle-finger-phalanx-intermediate',
  'middle-finger-phalanx-distal',
  'middle-finger-tip',
  'ring-finger-metacarpal',
  'ring-finger-phalanx-proximal',
  'ring-finger-phalanx-intermediate',
  'ring-finger-phalanx-distal',
  'ring-finger-tip',
  'pinky-finger-metacarpal',
  'pinky-finger-phalanx-proximal',
  'pinky-finger-phalanx-intermediate',
  'pinky-finger-phalanx-distal',
  'pinky-finger-tip',
] as const;

const JOINT_COUNT = HAND_JOINT_NAMES.length;
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_MCP = 5;
const INDEX_TIP = 9;
const MIDDLE_MCP = 10;
const MIDDLE_TIP = 14;
const RING_MCP = 15;
const RING_TIP = 19;
const PINKY_MCP = 20;
const PINKY_TIP = 24;

const CURL_TIP_INDICES = [THUMB_TIP, INDEX_TIP, MIDDLE_TIP, RING_TIP, PINKY_TIP];
const CURL_MCP_INDICES = [INDEX_MCP, MIDDLE_MCP, RING_MCP, PINKY_MCP];
const FINGER_COUNT = 4;

interface FrameWithFillPoses extends XRFrame {
  fillPoses?: (
    spaces: XRSpace[],
    baseSpace: XRSpace,
    transforms: Float32Array,
  ) => boolean;
}

/**
 * Per-hand joint reader and metric calculator. It never allocates while
 * updating: every vector, array and transform buffer is created in the
 * constructor and reused.
 */
export class HandState {
  readonly hand: HandId;

  readonly joints: Vector3[] = [];
  readonly palmCenter = new Vector3();
  readonly palmNormal = new Vector3();
  readonly palmForward = new Vector3();
  readonly pinchPoint = new Vector3();
  readonly fingertip = new Vector3();
  readonly thumbTip = new Vector3();
  readonly indexTip = new Vector3();
  readonly pinkyTip = new Vector3();

  /** thumb, index, middle, ring, pinky; normalised tip-to-palm distance. */
  readonly curl: number[] = [0, 0, 0, 0, 0];

  handSize = 0;
  pinchDistance = 0;
  pinchActive = false;
  pinchConfidence = 0;
  palmUpDot = 0;
  palmForwardDot = 0;
  spreadRatio = 0;
  tracked = false;

  private inputSource: XRInputSource | undefined;
  private readonly jointSpaces: (XRJointSpace | undefined)[] = [];
  private readonly spaces: XRJointSpace[] = [];
  private readonly transforms = new Float32Array(JOINT_COUNT * 16);
  private lostSeconds = 0;

  private readonly tmpA = new Vector3();

  constructor(hand: HandId) {
    this.hand = hand;
    for (let i = 0; i < JOINT_COUNT; i++) {
      this.joints.push(new Vector3());
    }
  }

  /** Rebuilds joint-space references only when the input source changes. */
  syncInputSource(source: XRInputSource | undefined): void {
    if (source === this.inputSource) {
      return;
    }
    this.inputSource = source;
    this.spaces.length = 0;
    const hand = source?.hand;
    for (let i = 0; i < JOINT_COUNT; i++) {
      const space = hand?.get(HAND_JOINT_NAMES[i] as XRHandJoint);
      this.jointSpaces[i] = space;
      if (space != null) {
        this.spaces.push(space);
      }
    }
  }

  hasAllJoints(): boolean {
    return this.spaces.length === JOINT_COUNT;
  }

  /**
   * Samples joints for this frame. `unscaledDelta` drives the tracking grace
   * period so it keeps working while game time is paused.
   */
  update(
    frame: XRFrame | null,
    referenceSpace: XRSpace | null,
    unscaledDelta: number,
    headForward: Vector3,
  ): void {
    if (frame == null || referenceSpace == null || !this.hasAllJoints()) {
      this.failTracking(unscaledDelta);
      return;
    }

    const filled = this.fillPoses(frame, referenceSpace);
    if (!filled) {
      this.failTracking(unscaledDelta);
      return;
    }

    this.lostSeconds = 0;
    this.tracked = true;
    this.readJointPositions();
    this.computeMetrics(headForward);
  }

  /** Clears momentary gesture input when the hand is lost or forced. */
  resetMomentaryInput(): void {
    this.pinchActive = false;
  }

  private fillPoses(frame: XRFrame, referenceSpace: XRSpace): boolean {
    const fillFrame = frame as FrameWithFillPoses;
    if (typeof fillFrame.fillPoses === 'function') {
      return fillFrame.fillPoses(this.spaces, referenceSpace, this.transforms);
    }

    // Older WebXR implementations only expose getJointPose. This path allocates
    // pose objects, so it is only a compatibility fallback.
    const getJointPose = frame.getJointPose;
    if (typeof getJointPose !== 'function') {
      return false;
    }
    for (let i = 0; i < JOINT_COUNT; i++) {
      const space = this.jointSpaces[i];
      if (space == null) {
        return false;
      }
      const pose = getJointPose.call(frame, space, referenceSpace);
      if (pose == null) {
        return false;
      }
      this.transforms.set(pose.transform.matrix, i * 16);
    }
    return true;
  }

  private failTracking(unscaledDelta: number): void {
    if (this.tracked) {
      this.lostSeconds += unscaledDelta;
      if (this.lostSeconds >= GESTURE_CONFIG.trackingGraceSeconds) {
        this.tracked = false;
        this.resetMomentaryInput();
        this.clearMetrics();
      }
    } else {
      this.lostSeconds = GESTURE_CONFIG.trackingGraceSeconds;
    }
  }

  private clearMetrics(): void {
    this.pinchDistance = 0;
    this.pinchConfidence = 0;
    this.palmUpDot = 0;
    this.palmForwardDot = 0;
    this.spreadRatio = 0;
    for (let i = 0; i < this.curl.length; i++) {
      this.curl[i] = 0;
    }
  }

  private readJointPositions(): void {
    for (let i = 0; i < JOINT_COUNT; i++) {
      const offset = i * 16;
      this.joints[i].set(
        this.transforms[offset + 12],
        this.transforms[offset + 13],
        this.transforms[offset + 14],
      );
    }
  }

  private computeMetrics(headForward: Vector3): void {
    const wrist = this.joints[WRIST];
    const middleMcp = this.joints[MIDDLE_MCP];
    this.handSize = wrist.distanceTo(middleMcp);
    if (this.handSize < GESTURE_CONFIG.minHandSizeM) {
      this.tracked = false;
      return;
    }

    // Palm centre: wrist plus the four knuckles, which keeps fingertip
    // distances comparable between open and closed hands.
    this.palmCenter.set(0, 0, 0);
    this.palmCenter.add(wrist);
    for (let i = 0; i < CURL_MCP_INDICES.length; i++) {
      this.palmCenter.add(this.joints[CURL_MCP_INDICES[i]]);
    }
    this.palmCenter.multiplyScalar(0.2);

    this.palmForward.copy(middleMcp).sub(wrist).normalize();
    this.tmpA.copy(this.joints[PINKY_MCP]).sub(this.joints[INDEX_MCP]);
    this.palmNormal.copy(this.tmpA).cross(this.palmForward).normalize();
    if (this.hand === 'left') {
      this.palmNormal.negate();
    }

    for (let i = 0; i < CURL_TIP_INDICES.length; i++) {
      this.curl[i] =
        this.joints[CURL_TIP_INDICES[i]].distanceTo(this.palmCenter) /
        this.handSize;
    }

    this.thumbTip.copy(this.joints[THUMB_TIP]);
    this.indexTip.copy(this.joints[INDEX_TIP]);
    this.pinkyTip.copy(this.joints[PINKY_TIP]);
    this.fingertip.copy(this.indexTip);
    this.pinchPoint.copy(this.thumbTip).add(this.indexTip).multiplyScalar(0.5);

    this.pinchDistance = this.thumbTip.distanceTo(this.indexTip);
    if (this.pinchActive) {
      this.pinchActive = this.pinchDistance < GESTURE_CONFIG.pinchEndM;
    } else {
      this.pinchActive = this.pinchDistance < GESTURE_CONFIG.pinchStartM;
    }
    const pinchRange =
      GESTURE_CONFIG.pinchEndM - GESTURE_CONFIG.pinchStartM;
    this.pinchConfidence = Math.max(
      0,
      Math.min(1, (GESTURE_CONFIG.pinchEndM - this.pinchDistance) / pinchRange),
    );

    this.spreadRatio =
      this.indexTip.distanceTo(this.pinkyTip) / this.handSize;

    this.palmUpDot = this.palmNormal.y;
    this.palmForwardDot = this.palmNormal.dot(headForward);
  }

  /** Average curl of index, middle, ring and pinky (0 = palm, ~1 = open). */
  averageFingerCurl(): number {
    let sum = 0;
    for (let i = 0; i < FINGER_COUNT; i++) {
      sum += this.curl[i + 1];
    }
    return sum / FINGER_COUNT;
  }

  minFingerCurl(): number {
    let min = this.curl[1];
    for (let i = 2; i <= FINGER_COUNT; i++) {
      if (this.curl[i] < min) {
        min = this.curl[i];
      }
    }
    return min;
  }

  /** Supplies vectors for event payloads without exposing mutable state. */
  copyPinchPoint(out: Vector3): void {
    out.copy(this.pinchPoint);
  }

  copyPalmNormal(out: Vector3): void {
    out.copy(this.palmNormal);
  }

  copyPalmPosition(out: Vector3): void {
    out.copy(this.palmCenter);
  }

  copyFingertip(out: Vector3): void {
    out.copy(this.fingertip);
  }
}
