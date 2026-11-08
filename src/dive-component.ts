/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, Types } from '@iwsdk/core';

export const DivePhases = {
  Room: 'Room',
  Dissolving: 'Dissolving',
  DeepSpace: 'DeepSpace',
  Returning: 'Returning',
} as const;

/**
 * Singleton state for the room-to-deep-space transition. Authored on the
 * hud-panel scene node with explicit initial values; DiveSystem owns the
 * runtime transitions and mirrors them here for ECS inspection.
 */
export const DiveControl = createComponent('DiveControl', {
  phase: { type: Types.Enum, default: DivePhases.Room, enum: DivePhases },
  progress: { type: Types.Float32, default: 0 },
});
