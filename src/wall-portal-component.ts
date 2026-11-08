/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, Types } from '@iwsdk/core';

export const WallPortalPhases = {
  Idle: 'Idle',
  Scanning: 'Scanning',
  Goo: 'Goo',
  Open: 'Open',
} as const;

/**
 * Singleton state for the pinch-opened wall portal. WallScanSystem owns the
 * runtime transitions and mirrors them here for ECS inspection.
 *
 * - wallPoint / wallNormal: the pinch-aimed point on the real wall and its
 *   outward normal, in world space. Written with getVectorView, never
 *   setValue (setValue throws on vector fields).
 * - goo: 0..1 growth of the gooey portal on the wall.
 */
export const WallPortal = createComponent('WallPortal', {
  phase: { type: Types.Enum, default: WallPortalPhases.Idle, enum: WallPortalPhases },
  goo: { type: Types.Float32, default: 0 },
  wallPoint: { type: Types.Vec3, default: [0, 1.5, -2] },
  wallNormal: { type: Types.Vec3, default: [0, 0, 1] },
});
