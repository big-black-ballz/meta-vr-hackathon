import { hivelordEvents } from './EventBus.js';

export const GameStates = {
  Boot: 'Boot',
  Menu: 'Menu',
  Playing: 'Playing',
  Paused: 'Paused',
  ChapterEnd: 'ChapterEnd',
  Error: 'Error',
} as const;

export type GameStateId = (typeof GameStates)[keyof typeof GameStates];

const LEGAL_TRANSITIONS: Record<GameStateId, readonly GameStateId[]> = {
  Boot: [GameStates.Menu, GameStates.Error],
  Menu: [GameStates.Playing, GameStates.Error],
  Playing: [GameStates.Paused, GameStates.ChapterEnd, GameStates.Error],
  Paused: [GameStates.Playing, GameStates.Error],
  ChapterEnd: [GameStates.Menu, GameStates.Error],
  Error: [GameStates.Menu],
};

type StateHandler = (from: GameStateId, to: GameStateId, reason?: string) => void;

class GameStateMachine {
  private state: GameStateId = GameStates.Boot;
  private enterHandlers = new Map<GameStateId, Set<StateHandler>>();
  private exitHandlers = new Map<GameStateId, Set<StateHandler>>();

  getState(): GameStateId {
    return this.state;
  }

  canTransition(from: GameStateId, to: GameStateId): boolean {
    return LEGAL_TRANSITIONS[from]?.includes(to) === true;
  }

  setState(next: GameStateId, reason?: string): boolean {
    const from = this.state;
    if (from === next) {
      return false;
    }
    if (!this.canTransition(from, next)) {
      console.warn(
        `[Hivelord] illegal state transition ${from} -> ${next}${reason ? ` (${reason})` : ''}`,
      );
      return false;
    }

    const exitSet = this.exitHandlers.get(from);
    if (exitSet != null) {
      for (const handler of exitSet) {
        handler(from, next, reason);
      }
    }

    this.state = next;

    const enterSet = this.enterHandlers.get(next);
    if (enterSet != null) {
      for (const handler of enterSet) {
        handler(from, next, reason);
      }
    }

    hivelordEvents.emit('StateChanged', { from, to: next, reason });
    console.info(
      `[Hivelord] state ${from} -> ${next}${reason ? ` (${reason})` : ''}`,
    );
    return true;
  }

  onEnter(state: GameStateId, handler: StateHandler): () => void {
    let set = this.enterHandlers.get(state);
    if (set == null) {
      set = new Set();
      this.enterHandlers.set(state, set);
    }
    set.add(handler);
    return () => this.enterHandlers.get(state)?.delete(handler);
  }

  onExit(state: GameStateId, handler: StateHandler): () => void {
    let set = this.exitHandlers.get(state);
    if (set == null) {
      set = new Set();
      this.exitHandlers.set(state, set);
    }
    set.add(handler);
    return () => this.exitHandlers.get(state)?.delete(handler);
  }
}

export const gameState = new GameStateMachine();
