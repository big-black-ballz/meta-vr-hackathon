import { Vector3 } from '@iwsdk/core';
import { hivelordEvents } from '../core/EventBus.js';
import { HandState } from './HandState.js';
import { GESTURE_CONFIG } from './gestureConfig.js';
import {
  GESTURE_LABELS,
  GESTURE_PRIORITY,
  gesturePriority,
  type GestureData,
  type GestureHand,
  type GestureId,
  type GestureStateId,
  type HandId,
  type Vec3Payload,
} from './GestureMap.js';

export type DominantHandSetting = 'left' | 'right' | 'auto';

interface HandTracker {
  primary: GestureId | null;
  candidate: GestureId | null;
  candidateFrames: number;
  candidateConfidence: number;
  releaseFrames: number;
  holdStart: number;
  confidence: number;
}

export interface ActiveGestureInfo {
  gesture: GestureId;
  hand: GestureHand;
  holdSeconds: number;
  confidence: number;
}

function newTracker(): HandTracker {
  return {
    primary: null,
    candidate: null,
    candidateFrames: 0,
    candidateConfidence: 0,
    releaseFrames: 0,
    holdStart: 0,
    confidence: 0,
  };
}

/**
 * Turns hand metrics into debounced, priority-resolved gestures and emits the
 * Level 1 event stream. One instance owns both hands and the two-hand stop.
 */
export class GestureDetector {
  readonly left = new HandState('left');
  readonly right = new HandState('right');

  private readonly leftTracker = newTracker();
  private readonly rightTracker = newTracker();
  private readonly stopTracker = newTracker();
  private stopRaw = false;

  private dominantSetting: DominantHandSetting = 'auto';
  private dominantHand: HandId | null = null;

  private leftWasTracked = false;
  private rightWasTracked = false;
  private gameTime = 0;

  private readonly eventLog: string[] = [];
  private readonly headRight = new Vector3();
  private readonly toHand = new Vector3();
  private readonly worldUp = new Vector3(0, 1, 0);
  private readonly eventPinch = new Vector3();
  private readonly eventNormal = new Vector3();
  private readonly eventPalm = new Vector3();
  private readonly eventFingertip = new Vector3();

  syncInputSources(
    leftSource: XRInputSource | undefined,
    rightSource: XRInputSource | undefined,
  ): void {
    this.left.syncInputSource(leftSource?.hand != null ? leftSource : undefined);
    this.right.syncInputSource(
      rightSource?.hand != null ? rightSource : undefined,
    );
  }

  update(
    frame: XRFrame | null,
    referenceSpace: XRSpace | null,
    gameDelta: number,
    unscaledDelta: number,
    headPosition: Vector3,
    headForward: Vector3,
    forcedLeft: GestureId | null,
    forcedRight: GestureId | null,
    forcedStop: boolean,
  ): void {
    this.gameTime += gameDelta;
    this.left.update(frame, referenceSpace, unscaledDelta, headForward);
    this.right.update(frame, referenceSpace, unscaledDelta, headForward);
    this.checkTracking(this.left, this.leftWasTracked, 'left');
    this.checkTracking(this.right, this.rightWasTracked, 'right');
    this.leftWasTracked = this.left.tracked;
    this.rightWasTracked = this.right.tracked;

    if (headForward.lengthSq() > 1e-6) {
      this.headRight.copy(headForward).cross(this.worldUp).normalize();
    } else {
      this.headRight.set(1, 0, 0);
    }

    const previousStopActive = this.stopTracker.primary != null;
    this.updateStop(forcedStop, headPosition, headForward);

    if (this.stopTracker.primary != null) {
      // Stop overrides both hands. End their single-hand gestures cleanly on
      // the transition into stop, then report stop for both hands.
      if (!previousStopActive) {
        this.endGestureIfActive(this.left, this.leftTracker);
        this.endGestureIfActive(this.right, this.rightTracker);
      }
      return;
    }

    this.updateHand(this.left, this.leftTracker, forcedLeft);
    this.updateHand(this.right, this.rightTracker, forcedRight);
  }

  getDominantHand(): HandId | null {
    if (this.dominantSetting === 'auto') {
      return this.dominantHand;
    }
    return this.dominantSetting;
  }

  getDominantSetting(): DominantHandSetting {
    return this.dominantSetting;
  }

  setDominantHand(setting: DominantHandSetting): void {
    this.dominantSetting = setting;
    this.dominantHand = setting === 'auto' ? null : setting;
  }

  getPrimaryGesture(hand: HandId): GestureId | null {
    if (this.stopTracker.primary === 'stop') {
      return 'stop';
    }
    return this.trackerFor(hand).primary;
  }

  isActive(gesture: GestureId, hand?: GestureHand): boolean {
    if (gesture === 'stop') {
      return this.stopTracker.primary === 'stop';
    }
    if (hand == null || hand === 'both') {
      return (
        this.leftTracker.primary === gesture ||
        this.rightTracker.primary === gesture
      );
    }
    return this.trackerFor(hand).primary === gesture;
  }

  getGestureState(gesture: GestureId, hand?: GestureHand): GestureStateId {
    if (gesture === 'stop') {
      return this.stateOf(this.stopTracker, 'stop');
    }
    if (hand === 'left') {
      return this.stateOf(this.leftTracker, gesture);
    }
    if (hand === 'right') {
      return this.stateOf(this.rightTracker, gesture);
    }
    const left = this.stateOf(this.leftTracker, gesture);
    const right = this.stateOf(this.rightTracker, gesture);
    return rankState(left) >= rankState(right) ? left : right;
  }

  getActiveGestures(): ActiveGestureInfo[] {
    const out: ActiveGestureInfo[] = [];
    if (this.stopTracker.primary === 'stop') {
      out.push({
        gesture: 'stop',
        hand: 'both',
        holdSeconds: this.gameTime - this.stopTracker.holdStart,
        confidence: this.stopTracker.confidence,
      });
      return out;
    }
    this.pushActive(out, 'left', this.leftTracker);
    this.pushActive(out, 'right', this.rightTracker);
    return out;
  }

  getHoldSeconds(gesture: GestureId, hand?: GestureHand): number {
    if (gesture === 'stop') {
      return this.stopTracker.primary === 'stop'
        ? this.gameTime - this.stopTracker.holdStart
        : 0;
    }
    if (hand === 'left') {
      return this.holdSecondsFor(this.leftTracker, gesture);
    }
    if (hand === 'right') {
      return this.holdSecondsFor(this.rightTracker, gesture);
    }
    return Math.max(
      this.holdSecondsFor(this.leftTracker, gesture),
      this.holdSecondsFor(this.rightTracker, gesture),
    );
  }

  getEventLog(): readonly string[] {
    return this.eventLog;
  }

  private pushActive(
    out: ActiveGestureInfo[],
    hand: HandId,
    tracker: HandTracker,
  ): void {
    if (tracker.primary != null) {
      out.push({
        gesture: tracker.primary,
        hand,
        holdSeconds: this.gameTime - tracker.holdStart,
        confidence: tracker.confidence,
      });
    }
  }

  private holdSecondsFor(tracker: HandTracker, gesture: GestureId): number {
    return tracker.primary === gesture ? this.gameTime - tracker.holdStart : 0;
  }

  private trackerFor(hand: HandId): HandTracker {
    return hand === 'left' ? this.leftTracker : this.rightTracker;
  }

  private stateOf(tracker: HandTracker, gesture: GestureId): GestureStateId {
    if (tracker.primary === gesture) {
      return tracker.releaseFrames > 0 ? 'Releasing' : 'Active';
    }
    if (tracker.candidate === gesture && tracker.candidateFrames > 0) {
      return 'Candidate';
    }
    return 'None';
  }

  private checkTracking(
    hand: HandState,
    wasTracked: boolean,
    handId: HandId,
  ): void {
    if (wasTracked && !hand.tracked) {
      this.endGestureIfActive(
        hand,
        handId === 'left' ? this.leftTracker : this.rightTracker,
      );
      hivelordEvents.emit('TrackingLost', { hand: handId });
      this.logEvent(`${handId === 'left' ? 'L' : 'R'} tracking lost`);
    } else if (!wasTracked && hand.tracked) {
      hivelordEvents.emit('TrackingRestored', { hand: handId });
      this.logEvent(`${handId === 'left' ? 'L' : 'R'} tracking restored`);
    }
  }

  private updateHand(
    hand: HandState,
    tracker: HandTracker,
    forced: GestureId | null,
  ): void {
    const raw = this.selectRawGesture(hand, tracker.primary, forced);

    if (tracker.primary == null) {
      if (raw == null) {
        tracker.candidate = null;
        tracker.candidateFrames = 0;
        return;
      }
      if (raw === tracker.candidate) {
        tracker.candidateFrames++;
      } else {
        tracker.candidate = raw;
        tracker.candidateFrames = 1;
        tracker.candidateConfidence = this.confidenceFor(hand, raw);
      }
      if (tracker.candidateFrames >= GESTURE_CONFIG.enterFrames) {
        this.startGesture(hand, tracker, raw);
      }
      return;
    }

    if (raw === tracker.primary) {
      tracker.releaseFrames = 0;
      tracker.candidate = null;
      tracker.candidateFrames = 0;
      return;
    }

    // A higher-priority gesture can take the slot after the same debounce.
    if (raw != null && gesturePriority(raw) < gesturePriority(tracker.primary)) {
      if (raw === tracker.candidate) {
        tracker.candidateFrames++;
      } else {
        tracker.candidate = raw;
        tracker.candidateFrames = 1;
        tracker.candidateConfidence = this.confidenceFor(hand, raw);
      }
      if (tracker.candidateFrames >= GESTURE_CONFIG.enterFrames) {
        this.endGesture(hand, tracker);
        this.startGesture(hand, tracker, raw);
      }
      return;
    }

    tracker.candidate = null;
    tracker.candidateFrames = 0;
    tracker.releaseFrames++;
    if (tracker.releaseFrames >= GESTURE_CONFIG.releaseFrames) {
      this.endGesture(hand, tracker);
    }
  }

  private selectRawGesture(
    hand: HandState,
    current: GestureId | null,
    forced: GestureId | null,
  ): GestureId | null {
    if (forced != null) {
      return forced === 'stop' ? null : forced;
    }
    if (!hand.tracked) {
      return null;
    }

    const averageCurl = hand.averageFingerCurl();
    const minCurl = hand.minFingerCurl();
    for (let i = 0; i < GESTURE_PRIORITY.length; i++) {
      const gesture = GESTURE_PRIORITY[i];
      const entering = current !== gesture;
      switch (gesture) {
        case 'pinch':
          if (hand.pinchActive) {
            return gesture;
          }
          break;
        case 'fist':
          if (
            averageCurl <
            (entering
              ? GESTURE_CONFIG.fistEnterCurl
              : GESTURE_CONFIG.fistExitCurl)
          ) {
            return gesture;
          }
          break;
        case 'cupped': {
          const slack = entering ? 0 : GESTURE_CONFIG.cuppedCurlSlack;
          const min = GESTURE_CONFIG.cuppedCurlMin - slack;
          const max = GESTURE_CONFIG.cuppedCurlMax + slack;
          if (
            hand.palmUpDot >
              (entering
                ? GESTURE_CONFIG.cuppedEnterDot
                : GESTURE_CONFIG.cuppedExitDot) &&
            averageCurl >= min &&
            averageCurl <= max
          ) {
            return gesture;
          }
          break;
        }
        case 'flatPalm':
          if (
            minCurl >
              (entering
                ? GESTURE_CONFIG.extendedEnterCurl
                : GESTURE_CONFIG.extendedExitCurl) &&
            hand.palmForwardDot >
              (entering
                ? GESTURE_CONFIG.flatEnterDot
                : GESTURE_CONFIG.flatExitDot)
          ) {
            return gesture;
          }
          break;
        case 'openPalm':
          if (
            minCurl >
              (entering
                ? GESTURE_CONFIG.extendedEnterCurl
                : GESTURE_CONFIG.extendedExitCurl) &&
            hand.spreadRatio >
              (entering
                ? GESTURE_CONFIG.openSpreadEnter
                : GESTURE_CONFIG.openSpreadExit)
          ) {
            return gesture;
          }
          break;
        default:
          break;
      }
    }
    return null;
  }

  private confidenceFor(hand: HandState, gesture: GestureId): number {
    switch (gesture) {
      case 'pinch':
        return hand.pinchConfidence;
      case 'fist':
        return clamp01(1 - hand.averageFingerCurl() / 0.6);
      case 'cupped':
        return clamp01(hand.palmUpDot);
      case 'flatPalm':
        return clamp01(hand.palmForwardDot);
      case 'openPalm':
        return clamp01(hand.spreadRatio / 1.4);
      default:
        return 1;
    }
  }

  private startGesture(
    hand: HandState,
    tracker: HandTracker,
    gesture: GestureId,
  ): void {
    tracker.primary = gesture;
    tracker.candidate = null;
    tracker.candidateFrames = 0;
    tracker.releaseFrames = 0;
    tracker.holdStart = this.gameTime;
    tracker.confidence = this.confidenceFor(hand, gesture);

    if (
      gesture === 'pinch' &&
      this.dominantSetting === 'auto' &&
      this.dominantHand == null
    ) {
      this.dominantHand = hand.hand;
    }

    const data = this.snapshotData(hand);
    hivelordEvents.emit('GestureStarted', {
      gesture,
      hand: hand.hand,
      time: this.gameTime,
      confidence: tracker.confidence,
      ...data,
    });
    this.logEvent(
      `${shortHand(hand.hand)} ${GESTURE_LABELS[gesture]} start ${tracker.confidence.toFixed(2)}`,
    );
  }

  private endGesture(hand: HandState, tracker: HandTracker): void {
    if (tracker.primary == null) {
      return;
    }
    const gesture = tracker.primary;
    const duration = this.gameTime - tracker.holdStart;
    const data = this.snapshotData(hand);
    hivelordEvents.emit('GestureEnded', {
      gesture,
      hand: hand.hand,
      time: this.gameTime,
      confidence: tracker.confidence,
      duration,
      ...data,
    });
    this.logEvent(
      `${shortHand(hand.hand)} ${GESTURE_LABELS[gesture]} end ${duration.toFixed(1)}s`,
    );
    tracker.primary = null;
    tracker.releaseFrames = 0;
    tracker.candidate = null;
    tracker.candidateFrames = 0;
  }

  private endGestureIfActive(hand: HandState, tracker: HandTracker): void {
    if (tracker.primary != null) {
      this.endGesture(hand, tracker);
    }
  }

  private updateStop(
    forcedStop: boolean,
    headPosition: Vector3,
    headForward: Vector3,
  ): void {
    this.stopRaw = forcedStop || this.detectStop(headPosition, headForward);
    const tracker = this.stopTracker;

    if (this.stopRaw) {
      tracker.releaseFrames = 0;
      if (tracker.primary == null) {
        tracker.candidateFrames++;
        if (tracker.candidateFrames >= GESTURE_CONFIG.enterFrames) {
          tracker.primary = 'stop';
          tracker.holdStart = this.gameTime;
          tracker.confidence = 0.9;
          const data = this.snapshotStopData(headPosition);
          hivelordEvents.emit('GestureStarted', {
            gesture: 'stop',
            hand: 'both',
            time: this.gameTime,
            confidence: tracker.confidence,
            ...data,
          });
          this.logEvent('both Stop start 0.90');
        }
      }
      return;
    }

    tracker.candidateFrames = 0;
    if (tracker.primary != null) {
      tracker.releaseFrames++;
      if (tracker.releaseFrames >= GESTURE_CONFIG.releaseFrames) {
        const duration = this.gameTime - tracker.holdStart;
        const data = this.snapshotStopData(headPosition);
        hivelordEvents.emit('GestureEnded', {
          gesture: 'stop',
          hand: 'both',
          time: this.gameTime,
          confidence: tracker.confidence,
          duration,
          ...data,
        });
        this.logEvent(`both Stop end ${duration.toFixed(1)}s`);
        tracker.primary = null;
        tracker.releaseFrames = 0;
      }
    }
  }

  private detectStop(
    headPosition: Vector3,
    headForward: Vector3,
  ): boolean {
    if (!this.left.tracked || !this.right.tracked) {
      return false;
    }
    const active = this.stopTracker.primary != null;
    const dot = active
      ? GESTURE_CONFIG.stopExitDot
      : GESTURE_CONFIG.stopEnterDot;
    if (
      this.left.palmForwardDot <= dot ||
      this.right.palmForwardDot <= dot
    ) {
      return false;
    }
    return (
      this.isStopHandInRange(this.left, headPosition, headForward) &&
      this.isStopHandInRange(this.right, headPosition, headForward)
    );
  }

  private isStopHandInRange(
    hand: HandState,
    headPosition: Vector3,
    headForward: Vector3,
  ): boolean {
    this.toHand.copy(hand.palmCenter).sub(headPosition);
    const forward = this.toHand.dot(headForward);
    if (
      forward < GESTURE_CONFIG.stopMinForwardM ||
      forward > GESTURE_CONFIG.stopMaxForwardM
    ) {
      return false;
    }
    const lateral = Math.abs(this.toHand.dot(this.headRight));
    if (lateral > GESTURE_CONFIG.stopMaxLateralM) {
      return false;
    }
    const belowHead = headPosition.y - hand.palmCenter.y;
    return (
      belowHead >= GESTURE_CONFIG.stopMinBelowHeadM &&
      belowHead <= GESTURE_CONFIG.stopMaxBelowHeadM
    );
  }

  private snapshotData(hand: HandState): GestureData {
    hand.copyPinchPoint(this.eventPinch);
    hand.copyPalmNormal(this.eventNormal);
    hand.copyPalmPosition(this.eventPalm);
    hand.copyFingertip(this.eventFingertip);
    return {
      pinchPoint: toPayload(this.eventPinch),
      palmNormal: toPayload(this.eventNormal),
      palmPosition: toPayload(this.eventPalm),
      fingertipPosition: toPayload(this.eventFingertip),
    };
  }

  private snapshotStopData(headPosition: Vector3): GestureData {
    this.eventPinch
      .copy(this.left.palmCenter)
      .add(this.right.palmCenter)
      .multiplyScalar(0.5);
    this.eventNormal
      .copy(this.left.palmNormal)
      .add(this.right.palmNormal)
      .normalize();
    this.eventPalm.copy(this.eventPinch);
    this.eventFingertip.copy(this.eventPinch);
    if (this.eventPalm.lengthSq() < 1e-6) {
      this.eventPalm.copy(headPosition);
      this.eventPinch.copy(headPosition);
      this.eventFingertip.copy(headPosition);
      this.eventNormal.set(0, 0, -1);
    }
    return {
      pinchPoint: toPayload(this.eventPinch),
      palmNormal: toPayload(this.eventNormal),
      palmPosition: toPayload(this.eventPalm),
      fingertipPosition: toPayload(this.eventFingertip),
    };
  }

  private logEvent(text: string): void {
    if (this.eventLog.length >= 5) {
      this.eventLog.shift();
    }
    this.eventLog.push(text);
  }
}

function toPayload(v: Vector3): Vec3Payload {
  return { x: v.x, y: v.y, z: v.z };
}

function shortHand(hand: HandId): string {
  return hand === 'left' ? 'L' : 'R';
}

function rankState(state: GestureStateId): number {
  switch (state) {
    case 'Active':
      return 3;
    case 'Releasing':
      return 2;
    case 'Candidate':
      return 1;
    default:
      return 0;
  }
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}
