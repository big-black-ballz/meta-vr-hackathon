import {
  AssetManager as SdkAssets,
  createSystem,
  VisibilityState,
} from '@iwsdk/core';
import { ASSET_TIMEOUT_MS, DEBUG } from '../core/config.js';
import { GameStates, gameState } from '../core/GameState.js';
import { hivelordEvents } from '../core/EventBus.js';
import {
  cancelGroup,
  getGroupModels,
  getStats,
  isReady,
  loadGroup,
  setMaxAnisotropy,
  unloadGroup,
} from './AssetManager.js';
import { validateManifest } from './manifest.js';
import { hookFirstGestureUnlock, unlockAudio } from './loaders/audio.js';
import { WarmupQueue } from './warmup.js';
import { checkSceneBudgets, estimateTextureMB } from './budgets.js';
import { cycleFailMode, toggleGallery } from './devtools.js';
import { setErrorMessage } from '../ui/UIManager.js';
import { assetUrl } from './assetUrl.js';

/**
 * AssetSystem: SDK loader init with local decoder paths, quiet boot preload,
 * Boot gating on boot-group readiness, background chapter1 preload on Menu,
 * GPU warm-up spread across frames, audio unlock hooks, budget warnings and
 * dev tools (gallery X, fail-sim Z). No gameplay logic.
 */
export class AssetSystem extends createSystem({}) {
  private readonly warmup = new WarmupQueue();
  private booted = false;
  private bootFailed = false;
  private chapterPreloadStarted = false;
  private wasImmersive = false;

  init(): void {
    const renderer = this.world.renderer;
    try {
      SdkAssets.init(renderer, this.world, {
        dracoDecoderPath: assetUrl('decoders/draco/'),
        ktx2TranscoderPath: assetUrl('decoders/basis/'),
      });
      SdkAssets.setLoadTimeout(ASSET_TIMEOUT_MS);
    } catch (error) {
      console.warn('[Hivelord] SDK asset init with local decoders failed', error);
    }
    try {
      setMaxAnisotropy(renderer.capabilities.getMaxAnisotropy());
    } catch {
      // Keep the default of 4.
    }
    hookFirstGestureUnlock();

    const issues = validateManifest();
    for (const issue of issues) {
      console.warn(`[Hivelord] manifest ${issue.kind}: ${issue.id} (${issue.detail})`);
    }

    this.cleanupFuncs.push(
      hivelordEvents.on('AssetGroupLoaded', ({ group }) => {
        if (group === 'boot') {
          this.warmup.enqueue(getGroupModels('boot'), []);
        }
      }),
      gameState.onEnter(GameStates.Menu, () => {
        if (!this.chapterPreloadStarted) {
          this.chapterPreloadStarted = true;
          void loadGroup('chapter1')
            .then((result) => {
              this.warmup.enqueue(getGroupModels('chapter1'), []);
              if (DEBUG) {
                console.info(
                  `[Hivelord] chapter1 background preload done in ${Math.round(result.ms)}ms, failed ${result.failed}`,
                );
              }
            })
            .catch((error: unknown) => {
              console.warn('[Hivelord] chapter1 background preload failed', error);
            });
        }
        if (this.bootFailed && !isReady('boot')) {
          this.bootFailed = false;
          void this.loadBoot();
        }
      }),
    );

    // Quiet preload starts with page load (the page IS the pre-session page).
    void this.loadBoot();
    console.info('[Hivelord] AssetSystem ready');
  }

  private async loadBoot(): Promise<void> {
    try {
      const result = await loadGroup('boot');
      this.booted = true;
      if (DEBUG) {
        console.info(
          `[Hivelord] boot group loaded in ${Math.round(result.ms)}ms, failed ${result.failed}`,
        );
      }
    } catch (error) {
      this.bootFailed = true;
      const reason = error instanceof Error ? error.message : String(error);
      console.error(`[Hivelord] boot group failed: ${reason}`);
      setErrorMessage(`Asset load failed: ${reason}`);
      gameState.setState(GameStates.Error, 'boot assets failed');
    }
  }

  update(): void {
    const immersive =
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (immersive && !this.wasImmersive) {
      unlockAudio();
      if (DEBUG) {
        console.info('[Hivelord] audio unlock on XR session start');
      }
    }
    this.wasImmersive = immersive;

    if (this.warmup.pending > 0) {
      this.warmup.pump(this.world.renderer, this.world.camera);
    }

    const stats = getStats();
    if (stats.loadFailures > 0 || stats.loadedAssets > 0) {
      this.checkBudgets();
    }

    if (DEBUG) {
      const keyboard = this.input.keyboard;
      if (keyboard?.getKeyDown('KeyX') === true) {
        const head = this.world.player.head;
        toggleGallery(this.world, head.position, head.quaternion);
      }
      if (keyboard?.getKeyDown('KeyZ') === true) {
        cycleFailMode();
      }
    }
  }

  private budgetLogged = false;

  private checkBudgets(): void {
    if (this.budgetLogged) {
      return;
    }
    const info = this.world.renderer.info;
    const programs = info.programs?.length ?? 0;
    void programs;
    checkSceneBudgets(
      {
        triangles: info.render.triangles,
        drawCalls: info.render.calls,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
      },
      estimateTextureMB(1024, 1024) * getStats().loadedAssets,
      getStats().bytesLoaded / 1048576,
    );
    this.budgetLogged = true;
    setTimeout(() => {
      this.budgetLogged = false;
    }, 10000);
  }

  /** Test hook: load chapter1 then unload it and compare renderer counts. */
  async testUnloadRoundTrip(): Promise<{ before: [number, number]; after: [number, number] }> {
    const info = this.world.renderer.info;
    const before: [number, number] = [info.memory.geometries, info.memory.textures];
    await loadGroup('chapter1');
    unloadGroup('chapter1');
    const after: [number, number] = [info.memory.geometries, info.memory.textures];
    console.info(
      `[Hivelord] unload round-trip geometries ${before[0]}->${after[0]}, textures ${before[1]}->${after[1]}`,
    );
    return { before, after };
  }
}
