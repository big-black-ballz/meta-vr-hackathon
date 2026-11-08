/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { createComponent, Types } from '@iwsdk/core';

export const RealityZones = {
  Real: 'Real',
  Blend: 'Blend',
  Cloud: 'Cloud',
} as const;

/**
 * Dial-driven transition state. 0 = Real, 0.5 = Blend, 1 = Cloud.
 * `scrubbing` holds the value while the user drags; releasing eases to the
 * nearest stable value over ~1 second.
 */
export const RealityDial = createComponent('RealityDial', {
  value: { type: Types.Float32, default: 0 },
  target: { type: Types.Float32, default: 0 },
  scrubbing: { type: Types.Boolean, default: false },
  zone: { type: Types.Enum, default: RealityZones.Real, enum: RealityZones },
});
