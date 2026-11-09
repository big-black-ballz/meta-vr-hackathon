import type { World } from '@iwsdk/core';
import { STRINGS } from './strings.js';
import { themeToCss } from './theme.js';

let overlay: HTMLDivElement | null = null;
let statusLine: HTMLDivElement | null = null;
let worldRef: World | null = null;
let dismissed = false;

const STYLE_ID = 'hivelord-presession-theme';

function ensureThemeStyle(): void {
  if (document.getElementById(STYLE_ID) != null) {
    return;
  }
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent =
    themeToCss() +
    `#hivelord-presession{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:var(--hiv-base);z-index:50;font-family:system-ui,sans-serif;}` +
    `#hivelord-presession .card{max-width:520px;margin:24px;padding:32px;background:var(--hiv-panel);border:1px solid var(--hiv-panel-edge);border-radius:18px;box-shadow:0 0 42px var(--hiv-primary-glow);color:var(--hiv-text);}` +
    `#hivelord-presession h1{font-size:28px;margin:0 0 12px 0;color:var(--hiv-primary);}` +
    `#hivelord-presession p{font-size:16px;line-height:1.5;color:var(--hiv-text-muted);}` +
    `#hivelord-presession .status{margin-top:16px;font-size:15px;color:var(--hiv-warning);}` +
    `#hivelord-presession button{display:block;width:100%;margin-top:12px;padding:14px;font-size:18px;font-weight:600;border-radius:10px;cursor:pointer;}` +
    `#hivelord-presession .enter{color:var(--hiv-text-on-primary);background:var(--hiv-primary);border:none;}` +
    `#hivelord-presession .virtual{background:transparent;color:var(--hiv-primary);border:2px solid var(--hiv-primary);}` +
    `#hivelord-presession button:focus-visible{outline:3px solid var(--hiv-primary);outline-offset:2px;}` +
    `@media (prefers-reduced-motion: reduce){#hivelord-presession *{transition:none !important;animation:none !important;}}`;
  document.head.append(style);
}

async function checkSupport(): Promise<string | null> {
  const nav = navigator as Navigator & {
    xr?: { isSessionSupported?: (mode: string) => Promise<boolean> };
  };
  if (nav.xr == null || nav.xr.isSessionSupported == null) {
    return STRINGS.presessionNoWebXR;
  }
  try {
    const ar = await nav.xr.isSessionSupported('immersive-ar');
    if (ar) {
      return null;
    }
    const vr = await nav.xr.isSessionSupported('immersive-vr');
    if (vr) {
      return STRINGS.presessionNoAR;
    }
    return STRINGS.presessionNoWebXR;
  } catch {
    return STRINGS.presessionNoWebXR;
  }
}

/**
 * Plain-DOM pre-session layer styled from the shared theme tokens: obsidian
 * card, gold title and primary button, warning status with a triangle glyph
 * (never color alone), visible keyboard focus, reduced-motion respect.
 */
export function initPresession(world: World): void {
  worldRef = world;
  if (overlay != null) {
    return;
  }
  ensureThemeStyle();
  const div = document.createElement('div');
  div.id = 'hivelord-presession';
  const card = document.createElement('div');
  card.className = 'card';
  const title = document.createElement('h1');
  title.textContent = STRINGS.presessionTitle;
  const pitch = document.createElement('p');
  pitch.textContent = STRINGS.appPitch;
  statusLine = document.createElement('div');
  statusLine.className = 'status';
  const enter = document.createElement('button');
  enter.className = 'enter';
  enter.textContent = STRINGS.presessionEnterXR;
  enter.addEventListener('click', () => {
    try {
      worldRef?.launchXR();
    } catch {
      if (statusLine != null) {
        statusLine.textContent = `\u25B2 ${STRINGS.presessionPermissionDenied}`;
      }
    }
  });
  const virtual = document.createElement('button');
  virtual.className = 'virtual';
  virtual.textContent = STRINGS.presessionVirtualMode;
  virtual.addEventListener('click', () => {
    dismissed = true;
    hidePresession();
  });
  card.append(title, pitch, statusLine, enter, virtual);
  div.append(card);
  document.body.append(div);
  overlay = div;

  void checkSupport().then((message) => {
    if (statusLine == null || dismissed) {
      return;
    }
    if (message == null) {
      statusLine.textContent = '';
      return;
    }
    if (message === STRINGS.presessionNoWebXR) {
      statusLine.textContent = `\u25B2 ${STRINGS.presessionDesktop}`;
      enter.style.display = 'none';
      return;
    }
    statusLine.textContent = `\u25B2 ${message}`;
  });
}

export function hidePresession(): void {
  if (overlay != null) {
    overlay.style.display = 'none';
  }
}

export function showPresession(): void {
  dismissed = false;
  if (overlay != null) {
    overlay.style.display = 'flex';
  }
}
