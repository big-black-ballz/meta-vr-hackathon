/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { PanelSystem } from './panel.js';
import { RealityDialSystem } from './reality-dial.js';
import { RobotSystem } from './robot.js';
import { RoomScanSystem } from './room-scan.js';
import { ToySystem } from './toys.js';

World.create(
  document.getElementById('scene-container') as HTMLDivElement,
  projectOptions,
).then((world) => {
  world.registerSystem(RobotSystem);
  world.registerSystem(PanelSystem);
  world.registerSystem(RealityDialSystem);
  world.registerSystem(RoomScanSystem);
  world.registerSystem(ToySystem);
});
