import { FIXED_TIMESTEP } from './config.js';

const MAX_FIXED_STEPS = 5;

/**
 * Single source of scaled game time for Hivelord systems. Existing systems
 * continue using their own update delta; only new Hivelord systems read this.
 */
class TimeControl {
  deltaTime = 0;
  unscaledDelta = 0;
  timeScale = 1;
  paused = false;

  private targetScale = 1;
  private easeDuration = 0;
  private easeElapsed = 0;
  private easeStart = 1;
  private accumulator = 0;

  pause(): void {
    this.paused = true;
    this.deltaTime = 0;
  }

  resume(): void {
    this.paused = false;
  }

  setTimeScale(value: number, easeSeconds = 0): void {
    const target = Math.max(0, value);
    if (easeSeconds <= 0) {
      this.timeScale = target;
      this.targetScale = target;
      this.easeDuration = 0;
      this.easeElapsed = 0;
      return;
    }
    this.easeStart = this.timeScale;
    this.targetScale = target;
    this.easeDuration = easeSeconds;
    this.easeElapsed = 0;
  }

  update(unscaledDelta: number): void {
    this.unscaledDelta = unscaledDelta;
    if (this.easeDuration > 0) {
      this.easeElapsed += unscaledDelta;
      const t = Math.min(1, this.easeElapsed / this.easeDuration);
      this.timeScale = this.easeStart + (this.targetScale - this.easeStart) * t;
      if (t >= 1) {
        this.timeScale = this.targetScale;
        this.easeDuration = 0;
        this.easeElapsed = 0;
      }
    }

    if (this.paused) {
      this.deltaTime = 0;
      return;
    }

    this.deltaTime = unscaledDelta * this.timeScale;
    this.accumulator = Math.min(
      this.accumulator + this.deltaTime,
      FIXED_TIMESTEP * MAX_FIXED_STEPS,
    );
  }

  /** Runs the fixed step at most MAX_FIXED_STEPS times, preventing a death spiral. */
  runFixed(step: (fixedDelta: number) => void): void {
    let steps = 0;
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_FIXED_STEPS) {
      step(FIXED_TIMESTEP);
      this.accumulator -= FIXED_TIMESTEP;
      steps++;
    }
    if (steps === MAX_FIXED_STEPS) {
      this.accumulator = 0;
    }
  }
}

export const timeControl = new TimeControl();
