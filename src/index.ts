/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import { World } from '@iwsdk/core';
import projectOptions from 'virtual:iwsdk-project';
import { HivelordGameSystem } from './hivelord/core/HivelordGameSystem.js';
import { DebugOverlaySystem } from './hivelord/debug/DebugOverlay.js';
import { HivelordInputSystem } from './hivelord/input/InputSystem.js';
import { UISystem } from './hivelord/ui/UISystem.js';
import { initPresession } from './hivelord/ui/presession.js';
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
  world.registerSystem(HivelordGameSystem);
  world.registerSystem(HivelordInputSystem);
  world.registerSystem(UISystem);
  world.registerSystem(DebugOverlaySystem);
  initPresession(world);
});
