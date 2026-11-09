/**
 * Procedural UI sounds. This repo has no sound system, so short WebAudio
 * oscillator blips stand in (see report). Master volume follows settings.
 */
let ctx: AudioContext | null = null;
let masterGain = 0.8;

export function setMasterVolume(v: number): void {
  masterGain = Math.max(0, Math.min(1, v));
}

function ensure(): AudioContext | null {
  try {
    if (ctx == null) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (Ctor == null) {
        return null;
      }
      ctx = new Ctor();
    }
    if (ctx.state === 'suspended') {
      void ctx.resume();
    }
    return ctx;
  } catch {
    return null;
  }
}

function blip(freq: number, seconds: number, gain: number, delay = 0): void {
  const ac = ensure();
  if (ac == null || masterGain <= 0) {
    return;
  }
  const now = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const out = ac.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, now);
  out.gain.setValueAtTime(gain * masterGain, now);
  out.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  osc.connect(out).connect(ac.destination);
  osc.start(now);
  osc.stop(now + seconds + 0.02);
}

export const uiSounds = {
  hover(): void {
    blip(880, 0.05, 0.05);
  },
  press(): void {
    blip(520, 0.09, 0.12);
  },
  open(): void {
    blip(440, 0.1, 0.1);
    blip(660, 0.12, 0.1, 0.07);
  },
  close(): void {
    blip(660, 0.08, 0.08);
    blip(440, 0.1, 0.08, 0.06);
  },
  error(): void {
    blip(220, 0.18, 0.14);
    blip(174, 0.22, 0.14, 0.1);
  },
  toggle(on: boolean): void {
    blip(on ? 700 : 500, 0.08, 0.1);
  },
};
