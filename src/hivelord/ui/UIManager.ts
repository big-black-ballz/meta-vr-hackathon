import { hivelordEvents } from '../core/EventBus.js';
import type { ScreenId } from './screen.js';
import type { UIScreen } from './screen.js';

export type InputContext = 'gameplay' | 'ui';

let context: InputContext = 'gameplay';

export function getInputContext(): InputContext {
  return context;
}

function setContext(next: InputContext): void {
  if (context === next) {
    return;
  }
  context = next;
  hivelordEvents.emit('InputContextChanged', { context: next });
}

export interface ConfirmOptions {
  title: string;
  message: string;
  onConfirm: () => void;
}

let pendingConfirm: ConfirmOptions | null = null;
let errorMessage = '';

export function setPendingConfirm(opts: ConfirmOptions | null): void {
  pendingConfirm = opts;
}

export function takePendingConfirm(): ConfirmOptions | null {
  const opts = pendingConfirm;
  pendingConfirm = null;
  return opts;
}

export function setErrorMessage(msg: string): void {
  errorMessage = msg;
}

export function getErrorMessage(): string {
  return errorMessage;
}

/**
 * Screen registry, stack/back navigation and focus. A visible blocking
 * screen switches the input context to UI (gameplay gestures suspended);
 * with no blocking screen the context is gameplay.
 */
export class UIManager {
  private screens = new Map<ScreenId, UIScreen>();
  private stack: ScreenId[] = [];

  register(screen: UIScreen): void {
    this.screens.set(screen.id, screen);
  }

  show(id: ScreenId, data?: unknown): void {
    const screen = this.screens.get(id);
    if (screen == null) {
      return;
    }
    const top = this.focus();
    if (top === id) {
      return;
    }
    if (top != null) {
      this.screens.get(top)?.hide();
      hivelordEvents.emit('UIClosed', { screen: top });
    }
    this.stack.push(id);
    screen.onShow(data);
    screen.show();
    hivelordEvents.emit('UIOpened', { screen: id });
    this.refreshContext();
  }

  hide(id: ScreenId): void {
    const index = this.stack.lastIndexOf(id);
    if (index === -1) {
      return;
    }
    this.stack.splice(index, 1);
    this.screens.get(id)?.hide();
    hivelordEvents.emit('UIClosed', { screen: id });
    const top = this.focus();
    if (top != null) {
      const screen = this.screens.get(top);
      if (screen != null && !screen.visible) {
        screen.show();
        hivelordEvents.emit('UIOpened', { screen: top });
      }
    }
    this.refreshContext();
  }

  hideAll(): void {
    const open = [...this.stack];
    this.stack.length = 0;
    for (const id of open) {
      this.screens.get(id)?.hide();
      hivelordEvents.emit('UIClosed', { screen: id });
    }
    this.refreshContext();
  }

  back(): void {
    const top = this.stack.pop();
    if (top == null) {
      return;
    }
    this.screens.get(top)?.hide();
    hivelordEvents.emit('UIClosed', { screen: top });
    const next = this.focus();
    if (next != null) {
      const screen = this.screens.get(next);
      if (screen != null && !screen.visible) {
        screen.show();
        hivelordEvents.emit('UIOpened', { screen: next });
      }
    }
    this.refreshContext();
  }

  focus(): ScreenId | null {
    return this.stack.length > 0 ? this.stack[this.stack.length - 1] : null;
  }

  isOpen(id: ScreenId): boolean {
    return this.stack.includes(id);
  }

  isUIBlockingGameplay(): boolean {
    const top = this.focus();
    if (top == null) {
      return false;
    }
    return this.screens.get(top)?.blocking === true;
  }

  update(dt: number): void {
    const top = this.focus();
    if (top == null) {
      return;
    }
    this.screens.get(top)?.update(dt);
  }

  private refreshContext(): void {
    setContext(this.isUIBlockingGameplay() ? 'ui' : 'gameplay');
  }
}
