import {
  BoxGeometry,
  CanvasTexture,
  CapsuleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  SphereGeometry,
  Texture,
} from '@iwsdk/core';
import { DEBUG } from '../core/config.js';
import type { FallbackKind } from './manifest.js';

/**
 * Procedural fallbacks, one cached prototype per kind. get*() returns a fresh
 * instance sharing geometry/materials (never the prototype itself). In dev
 * builds everything is tinted magenta so stand-ins are never silently missed;
 * production builds are neutral. Shared materials and prototypes are never
 * disposed by group unloading.
 */

const DEV_TINT = DEBUG;

function tint(hex: number): number {
  return DEV_TINT ? 0xff2fd6 : hex;
}

const materials = new Map<string, MeshBasicMaterial>();

function mat(key: string, hex: number, wireframe = false): MeshBasicMaterial {
  let m = materials.get(key);
  if (m == null) {
    m = new MeshBasicMaterial({ color: tint(hex), wireframe });
    materials.set(key, m);
  }
  return m;
}

function mesh(
  geo: BoxGeometry | SphereGeometry | CapsuleGeometry,
  material: MeshBasicMaterial,
  x = 0,
  y = 0,
  z = 0,
): Mesh {
  const m = new Mesh(geo, material);
  m.position.set(x, y, z);
  return m;
}

const boxGeoCache = new Map<string, BoxGeometry>();
const sphereGeoCache = new Map<string, SphereGeometry>();
const capsuleGeoCache = new Map<string, CapsuleGeometry>();

function box(w: number, h: number, d: number): BoxGeometry {
  const key = `${w}|${h}|${d}`;
  let g = boxGeoCache.get(key);
  if (g == null) {
    g = new BoxGeometry(w, h, d);
    boxGeoCache.set(key, g);
  }
  return g;
}

function ball(r: number): SphereGeometry {
  const key = `${r}`;
  let g = sphereGeoCache.get(key);
  if (g == null) {
    g = new SphereGeometry(r, 12, 10);
    sphereGeoCache.set(key, g);
  }
  return g;
}

function capsule(r: number, len: number): CapsuleGeometry {
  const key = `${r}|${len}`;
  let g = capsuleGeoCache.get(key);
  if (g == null) {
    g = new CapsuleGeometry(r, len, 6, 12);
    capsuleGeoCache.set(key, g);
  }
  return g;
}

function buildBot(): Object3D {
  const g = new Group();
  g.name = 'fallback-bot';
  g.add(mesh(capsule(0.16, 0.3), mat('bot', 0xd9a93a), 0, 0.35, 0));
  g.add(mesh(ball(0.09), mat('bot-eye', 0xfff2c0), 0, 0.52, 0.1));
  return g;
}

function buildBandit(): Object3D {
  const g = new Group();
  g.name = 'fallback-bandit';
  g.add(mesh(capsule(0.22, 0.9), mat('bandit', 0x2a2438), 0, 0.85, 0));
  g.add(mesh(ball(0.16), mat('bandit-head', 0x3a3348), 0, 1.62, 0));
  return g;
}

function buildProp(sizeM = 0.6): Object3D {
  const g = new Group();
  g.name = 'fallback-prop';
  g.add(mesh(box(sizeM, sizeM, sizeM), mat('prop', 0x6a6f78), 0, sizeM / 2, 0));
  return g;
}

function buildModel(): Object3D {
  const g = new Group();
  g.name = 'fallback-model';
  g.add(mesh(box(0.5, 0.5, 0.5), mat('model', 0x8a8f98, true), 0, 0.25, 0));
  return g;
}

const builders: Record<FallbackKind, () => Object3D> = {
  bot: buildBot,
  bandit: buildBandit,
  prop: () => buildProp(),
  model: buildModel,
  texture: buildModel,
  'texture-white': buildModel,
  audio: buildModel,
  image: buildModel,
};

const prototypes = new Map<FallbackKind, Object3D>();

/** Fresh fallback instance (shared geometry/materials). Never undefined. */
export function getFallbackObject(kind: FallbackKind): Object3D {
  let proto = prototypes.get(kind);
  if (proto == null) {
    proto = builders[kind]();
    prototypes.set(kind, proto);
  }
  return proto.clone();
}

let checker: CanvasTexture | null = null;
let white: CanvasTexture | null = null;

function makeChecker(): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 4;
  const ctx = canvas.getContext('2d');
  if (ctx != null) {
    ctx.fillStyle = DEV_TINT ? '#ff2fd6' : '#808080';
    ctx.fillRect(0, 0, 4, 4);
    ctx.fillStyle = DEV_TINT ? '#7a1040' : '#303030';
    ctx.fillRect(0, 0, 2, 2);
    ctx.fillRect(2, 2, 2, 2);
  }
  const tex = new CanvasTexture(canvas);
  tex.name = 'fallback-checker';
  return tex;
}

/** Shared 4x4 checker (or 1x1 white for sprites). */
export function getFallbackTexture(kind: FallbackKind): Texture {
  if (kind === 'texture-white') {
    if (white == null) {
      const canvas = document.createElement('canvas');
      canvas.width = 1;
      canvas.height = 1;
      const tex = new CanvasTexture(canvas);
      tex.name = 'fallback-white';
      white = tex;
    }
    return white;
  }
  if (checker == null) {
    checker = makeChecker();
  }
  return checker;
}

const silentBuffers = new WeakMap<AudioContext, AudioBuffer>();

/** Short silent buffer (soft tone in dev so missing audio is audible). */
export function getFallbackAudio(ctx: AudioContext): AudioBuffer {
  let buffer = silentBuffers.get(ctx);
  if (buffer == null) {
    const length = Math.floor(ctx.sampleRate * 0.15);
    buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    if (DEV_TINT) {
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) {
        data[i] = Math.sin((i / length) * Math.PI * 4) * 0.08;
      }
    }
    silentBuffers.set(ctx, buffer);
  }
  return buffer;
}

const stills = new Map<string, CanvasTexture>();

/** Dark gradient still with the asset id as text. */
export function getFallbackStill(id: string): CanvasTexture {
  let tex = stills.get(id);
  if (tex == null) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');
    if (ctx != null) {
      const grad = ctx.createLinearGradient(0, 0, 0, 160);
      grad.addColorStop(0, DEV_TINT ? '#3a0f2a' : '#14110d');
      grad.addColorStop(1, DEV_TINT ? '#12030c' : '#0a0908');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 256, 160);
      ctx.fillStyle = DEV_TINT ? '#ff2fd6' : '#b0a58f';
      ctx.font = '500 20px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(id.slice(0, 24), 128, 80, 240);
    }
    tex = new CanvasTexture(canvas);
    tex.name = `fallback-still:${id}`;
    stills.set(id, tex);
  }
  return tex;
}
