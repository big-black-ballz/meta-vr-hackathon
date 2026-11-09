import type { World } from '@iwsdk/core';
import { STRINGS } from './strings.js';

let overlay: HTMLDivElement | null = null;
let statusLine: HTMLDivElement | null = null;
let worldRef: World | null = null;
let dismissed = false;

function styleOverlay(div: HTMLDivElement): void {
  div.style.position = 'fixed';
  div.style.inset = '0';
  div.style.display = 'flex';
  div.style.alignItems = 'center';
  div.style.justifyContent = 'center';
  div.style.background = 'rgba(4, 8, 16, 0.92)';
  div.style.zIndex = '50';
  div.style.fontFamily = 'system-ui, sans-serif';
}

function makeButton(label: string): HTMLButtonElement {
  const button = document.createElement('button');
  button.textContent = label;
  button.style.display = 'block';
  button.style.width = '100%';
  button.style.marginTop = '12px';
  button.style.padding = '14px';
  button.style.fontSize = '18px';
  button.style.fontWeight = '600';
  button.style.color = '#06121f';
  button.style.background = '#6fe6ff';
  button.style.border = 'none';
  button.style.borderRadius = '10px';
  button.style.cursor = 'pointer';
  return button;
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
 * Plain-DOM pre-session layer: compatibility messages, minimal branding and
 * the desktop-visitor explanation. The SDK welcome panel keeps its own Enter
 * button; this layer handles messaging before any session exists.
 */
export function initPresession(world: World): void {
  worldRef = world;
  if (overlay != null) {
    return;
  }
  const div = document.createElement('div');
  styleOverlay(div);
  const card = document.createElement('div');
  card.style.maxWidth = '520px';
  card.style.margin = '24px';
  card.style.padding = '32px';
  card.style.background = '#0a1220';
  card.style.border = '2px solid rgba(111, 230, 255, 0.55)';
  card.style.borderRadius = '18px';
  card.style.color = '#ebfaff';
  const title = document.createElement('h1');
  title.style.fontSize = '28px';
  title.style.margin = '0 0 12px 0';
  title.textContent = STRINGS.presessionTitle;
  const pitch = document.createElement('p');
  pitch.style.fontSize = '16px';
  pitch.style.lineHeight = '1.5';
  pitch.style.color = '#a0c4d8';
  pitch.textContent = STRINGS.appPitch;
  statusLine = document.createElement('div');
  statusLine.style.marginTop = '16px';
  statusLine.style.fontSize = '15px';
  statusLine.style.color = '#ffa23a';
  const enter = makeButton(STRINGS.presessionEnterXR);
  enter.addEventListener('click', () => {
    try {
      worldRef?.launchXR();
    } catch {
      if (statusLine != null) {
        statusLine.textContent = STRINGS.presessionPermissionDenied;
      }
    }
  });
  const virtual = makeButton(STRINGS.presessionVirtualMode);
  virtual.style.background = 'transparent';
  virtual.style.color = '#6fe6ff';
  virtual.style.border = '2px solid rgba(111, 230, 255, 0.55)';
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
      statusLine.textContent = `${STRINGS.presessionDesktop}`;
      enter.style.display = 'none';
      return;
    }
    statusLine.textContent = message;
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
