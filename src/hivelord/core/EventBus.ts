import { DEBUG } from './config.js';

export interface HivelordEventMap {
  StateChanged: { from: string; to: string; reason?: string };
  GestureStarted: { gesture: string };
  GestureEnded: { gesture: string };
  AbilityUsed: { ability: string };
  EnemyStunned: { enemyId: number };
  ObjectiveCompleted: { objectiveId: string };
  ChapterCompleted: { chapterId: string };
  TrackingLost: { hand: 'left' | 'right' | 'both' };
  TrackingRestored: { hand: 'left' | 'right' | 'both' };
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
