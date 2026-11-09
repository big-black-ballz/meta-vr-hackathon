import { createSystem } from '@iwsdk/core';
import {
  AUTO_ADVANCE_ON_BOOT,
  BOOT_TO_MENU_SECONDS,
  MENU_TO_PLAYING_SECONDS,
  PAUSE_KEY,
} from './config.js';
import { GameStates, gameState } from './GameState.js';
import { timeControl } from './TimeControl.js';

/**
 * Boots the Level 0 flow and owns the pause key. Existing app systems are not
 * affected; only Hivelord systems read `timeControl`.
 */
export class HivelordGameSystem extends createSystem({}) {
  private elapsed = 0;

  init(): void {
    this.cleanupFuncs.push(
      gameState.onEnter(GameStates.Paused, () => timeControl.pause()),
      gameState.onExit(GameStates.Paused, () => timeControl.resume()),
    );
    console.info('[Hivelord] Level 0 initialized');
  }

  update(delta: number): void {
    timeControl.update(delta);
    this.elapsed += delta;

    if (AUTO_ADVANCE_ON_BOOT) {
      if (
        gameState.getState() === GameStates.Boot &&
        this.elapsed >= BOOT_TO_MENU_SECONDS
      ) {
        gameState.setState(GameStates.Menu, 'auto boot complete');
      } else if (
        gameState.getState() === GameStates.Menu &&
        this.elapsed >= BOOT_TO_MENU_SECONDS + MENU_TO_PLAYING_SECONDS
      ) {
        gameState.setState(GameStates.Playing, 'auto menu complete');
      }
    }

    if (this.input.keyboard?.getKeyDown(PAUSE_KEY) === true) {
      const state = gameState.getState();
      if (state === GameStates.Playing) {
        gameState.setState(GameStates.Paused, 'pause key');
      } else if (state === GameStates.Paused) {
        gameState.setState(GameStates.Playing, 'resume key');
      }
    }
  }
}
