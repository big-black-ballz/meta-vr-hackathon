import { hivelordEvents } from '../core/EventBus.js';

export type SubtitleSize = 'S' | 'M' | 'L';
export type SubtitleBg = 'none' | 'light' | 'solid';
export type QualityLevel = 'low' | 'medium' | 'high';
export type DominantHandOption = 'left' | 'right' | 'auto';

export interface HivelordSettings {
  master: number;
  music: number;
  sfx: number;
  voice: number;
  subtitlesOn: boolean;
  subtitleSize: SubtitleSize;
  subtitleBg: SubtitleBg;
  dominantHand: DominantHandOption;
  quality: QualityLevel;
  reduceFlashing: boolean;
  vignette: boolean;
  debugOverlay: boolean;
  hudVisible: boolean;
}

const DEFAULTS: HivelordSettings = {
  master: 0.8,
  music: 0.7,
  sfx: 0.9,
  voice: 1,
  subtitlesOn: true,
  subtitleSize: 'M',
  subtitleBg: 'light',
  dominantHand: 'auto',
  quality: 'medium',
  reduceFlashing: false,
  vignette: true,
  debugOverlay: true,
  hudVisible: true,
};

const STORAGE_KEY = 'hivelord.settings.v1';

type SettingKey = keyof HivelordSettings;

/**
 * Settings store. Persists through localStorage (this repo has no memory
 * system; see report). Every change emits SettingChanged.
 */
class SettingsStore {
  private values: HivelordSettings = { ...DEFAULTS };

  load(): void {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw == null) {
        return;
      }
      const parsed = JSON.parse(raw) as Partial<HivelordSettings>;
      this.values = { ...DEFAULTS, ...parsed };
    } catch {
      this.values = { ...DEFAULTS };
    }
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.values));
    } catch {
      // Storage unavailable; settings live for this session only.
    }
  }

  clear(): void {
    this.values = { ...DEFAULTS };
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore.
    }
  }

  get<K extends SettingKey>(key: K): HivelordSettings[K] {
    return this.values[key];
  }

  set<K extends SettingKey>(key: K, value: HivelordSettings[K]): void {
    if (this.values[key] === value) {
      return;
    }
    this.values[key] = value;
    this.save();
    hivelordEvents.emit('SettingChanged', {
      key: key as string,
      value: value as string | number | boolean,
    });
  }

  snapshot(): HivelordSettings {
    return { ...this.values };
  }
}

export const settings = new SettingsStore();
