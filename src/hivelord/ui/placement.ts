import { Quaternion, Vector3 } from '@iwsdk/core';
import { SEATED_REACH_M } from '../core/config.js';

/**
 * Minimal Level 2-lite helpers: home point, recenter, reach checks and
 * view-aware placement. Smallest versions that unblock the UI layer.
 */
const homePoint = new Vector3(0, 0, 0);
const tmpDir = new Vector3();
const tmpHead = new Vector3();
const FWD_Z = new Vector3(0, 0, 1);

/** Seated home point of the player rig. Defaults to the scene origin. */
export function getHomePoint(out: Vector3): Vector3 {
  return out.copy(homePoint);
}

/**
 * Recenters UI on the current head yaw. Blocking screens re-place on the
 * next update after this call.
 */
let recenterRequest = false;
export function recenter(): void {
  recenterRequest = true;
}

/** Consumed by the UI system once per frame. */
export function consumeRecenterRequest(): boolean {
  const pending = recenterRequest;
  recenterRequest = false;
  return pending;
}

/** True when a world position is comfortably reachable while seated. */
export function isWithinReach(
  pos: Vector3,
  headPos: Vector3,
  marginM = 0.15,
): boolean {
  return pos.distanceTo(headPos) <= SEATED_REACH_M + marginM;
}

/**
 * Places `out` at `distance` metres in front of the head, rotated
 * `angleDeg` (yaw, negative is left) off the view center and raised by
 * `heightOffset`. `outQuat` faces the position back at the head.
 */
export function placeInView(
  out: Vector3,
  outQuat: Quaternion,
  headPos: Vector3,
  headQuat: Quaternion,
  distance: number,
  angleDeg: number,
  heightOffset: number,
): void {
  tmpDir.set(0, 0, -1).applyQuaternion(headQuat);
  tmpDir.y = 0;
  if (tmpDir.lengthSq() < 1e-6) {
    tmpDir.set(0, 0, -1);
  }
  tmpDir.normalize();
  const angle = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const x = tmpDir.x * cos - tmpDir.z * sin;
  const z = tmpDir.x * sin + tmpDir.z * cos;
  out.set(
    headPos.x + x * distance,
    headPos.y + heightOffset,
    headPos.z + z * distance,
  );
  tmpHead.copy(headPos).sub(out).normalize();
  outQuat.setFromUnitVectors(FWD_Z, tmpHead);
}
