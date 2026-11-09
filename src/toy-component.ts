/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, Types } from '@iwsdk/core';

export const ToyKinds = {
  RubberBall: 'RubberBall',
  HeavyBall: 'HeavyBall',
  GlowOrb: 'GlowOrb',
  Cube: 'Cube',
  Cylinder: 'Cylinder',
  Pyramid: 'Pyramid',
  Ring: 'Ring',
} as const;

export type ToyKind = (typeof ToyKinds)[keyof typeof ToyKinds];

/** Marks a dynamic toy so the toy system can track holds, impacts, and resets. */
export const Toy = createComponent('Toy', {
  kind: { type: Types.Enum, default: ToyKinds.RubberBall, enum: ToyKinds },
});
