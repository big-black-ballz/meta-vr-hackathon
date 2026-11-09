import type {
  GestureData,
  GestureHand,
  GestureId,
} from '../input/GestureMap.js';
import { DEBUG } from './config.js';

export interface HivelordEventMap {
  StateChanged: { from: string; to: string; reason?: string };
  GestureStarted: GestureData & {
    gesture: GestureId;
    hand: GestureHand;
    time: number;
    confidence: number;
  };
  GestureEnded: GestureData & {
    gesture: GestureId;
    hand: GestureHand;
    time: number;
    confidence: number;
    duration: number;
  };
  AbilityUsed: { ability: string };
  EnemyStunned: { enemyId: number };
  ObjectiveCompleted: { objectiveId: string };
  ChapterCompleted: { chapterId: string };
  TrackingLost: { hand: GestureHand };
  TrackingRestored: { hand: GestureHand };
  UIOpened: { screen: string };
  UIClosed: { screen: string };
  InputContextChanged: { context: 'gameplay' | 'ui' };
  ButtonPressed: { id: string; screen: string };
  SettingChanged: { key: string; value: string | number | boolean };
  SkillUnlocked: { skillId: string };
  ObjectiveChanged: { text: string };
  ToastRequested: { text: string; kind: 'info' | 'success' | 'warning' };
  SubtitleRequested: {
    speaker: string;
    text: string;
    durationSeconds?: number;
  };
  AssetProgress: { group: string; loaded: number; total: number };
  AssetGroupLoaded: { group: string; ms: number; failed: number };
  AssetFailed: { id: string; group: string; reason: string; critical: boolean };
  AssetFallbackUsed: { id: string; kind: string };
}

type Handler<T> = (payload: T) => void;
type EventKey = keyof HivelordEventMap;

class HivelordEventBus {
  private handlers = new Map<EventKey, Set<Handler<never>>>();

  on<K extends EventKey>(event: K, handler: Handler<HivelordEventMap[K]>): () => void {
    let set = this.handlers.get(event);
    if (set == null) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler as Handler<never>);
    return () => this.off(event, handler);
  }

  off<K extends EventKey>(event: K, handler: Handler<HivelordEventMap[K]>): void {
    const set = this.handlers.get(event);
    if (set == null) {
      return;
    }
    set.delete(handler as Handler<never>);
    if (set.size === 0) {
      this.handlers.delete(event);
    }
  }

  once<K extends EventKey>(
    event: K,
    handler: Handler<HivelordEventMap[K]>,
  ): () => void {
    const wrapper: Handler<HivelordEventMap[K]> = (payload) => {
      this.off(event, wrapper);
      handler(payload);
    };
    return this.on(event, wrapper);
  }

  emit<K extends EventKey>(event: K, payload: HivelordEventMap[K]): void {
    if (DEBUG) {
      console.debug(`[Hivelord] event ${String(event)}`, payload);
    }
    const set = this.handlers.get(event);
    if (set == null) {
      return;
    }
    for (const handler of set) {
      (handler as Handler<HivelordEventMap[K]>)(payload);
    }
  }

  clear(): void {
    this.handlers.clear();
  }
}

export const hivelordEvents = new HivelordEventBus();
