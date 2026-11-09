/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AdditiveBlending,
  BackSide,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  createSystem,
  DoubleSide,
  Entity,
  Group,
  InputComponent,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  Quaternion,
  ShaderMaterial,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { RealityDial, RealityZones } from './reality-dial-component.js';

const DIAL_SPEED = 0.3; // full sweep in ~3.3s
const EASE_SECONDS = 1;
const DEADZONE = 0.15;
const HAND_SWEEP_METERS = 1.25;

const ROOM_HX = 2.0;
const ROOM_HZ = 2.2;
const ROOM_H = 2.6;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function nearestStable(v: number): number {
  return Math.round(v * 2) / 2;
}

function moveToward(current: number, target: number, maxDelta: number): number {
  const delta = target - current;
  if (Math.abs(delta) <= maxDelta) {
    return target;
  }
  return current + Math.sign(delta) * maxDelta;
}

function zoneFor(v: number): string {
  if (v <= 0.25) {
    return RealityZones.Real;
  }
  if (v >= 0.75) {
    return RealityZones.Cloud;
  }
  return RealityZones.Blend;
}

const MEMBRANE_VERTEX = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const MEMBRANE_FRAGMENT = `
uniform float uValue;
uniform float uTime;
varying vec3 vWorld;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

void main() {
  float n = noise(vWorld * 2.3 + vec3(0.0, uTime * 0.25, 0.0));
  float edge = 1.0 - smoothstep(0.0, 0.12, abs(n - 0.5));
  float fade = smoothstep(0.0, 0.05, uValue) * (1.0 - smoothstep(0.9, 1.0, uValue));
  float alpha = (0.02 + edge * 0.32) * fade;
  vec3 color = mix(vec3(0.10, 0.48, 0.85), vec3(0.85, 0.96, 1.0), edge);
  gl_FragColor = vec4(color, alpha);
}
`;

const GRID_VERTEX = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const GRID_FRAGMENT = `
uniform float uValue;
uniform float uTime;
uniform float uFogFar;
varying vec3 vWorld;

void main() {
  vec2 p = vWorld.xz;
  vec2 g = abs(fract(p * 1.0) - 0.5);
  float major = 1.0 - smoothstep(0.46, 0.5, max(g.x, g.y));
  vec2 gm = abs(fract(p * 5.0) - 0.5);
  float minor = 1.0 - smoothstep(0.47, 0.5, max(gm.x, gm.y));

  float dist = length(p);
  float fog = 1.0 - smoothstep(3.0, uFogFar, dist);
  float gate = smoothstep(0.15, 0.9, uValue);

  vec3 nearColor = vec3(0.35, 0.88, 1.0);
  vec3 farColor = vec3(0.16, 0.52, 0.72);
  vec3 color = mix(farColor, nearColor, fog);

  float alpha = (major * 0.45 + minor * 0.10) * gate * fog;
  alpha *= 0.85 + 0.15 * sin(uTime * 0.5 + p.x * 0.12 + p.y * 0.1);
  gl_FragColor = vec4(color, alpha);
}
`;

const DOME_VERTEX = `
varying vec3 vDirection;
void main() {
  vDirection = normalize(position);
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DOME_FRAGMENT = `
uniform float uValue;
uniform float uTime;
varying vec3 vDirection;

float hash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash(i + vec3(0.0, 0.0, 0.0)), hash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(hash(i + vec3(0.0, 1.0, 0.0)), hash(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(hash(i + vec3(0.0, 0.0, 1.0)), hash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(hash(i + vec3(0.0, 1.0, 1.0)), hash(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float fbm(vec3 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 3; i++) {
    value += amplitude * noise(p);
    p *= 2.03;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec3 d = normalize(vDirection);
  float h = clamp(d.y * 0.5 + 0.5, 0.0, 1.0);

  vec3 horizon = vec3(0.28, 0.78, 0.92);
  vec3 mid = vec3(0.07, 0.04, 0.22);
  vec3 zenith = vec3(0.02, 0.01, 0.09);

  vec3 color = mix(horizon, mid, smoothstep(0.0, 0.30, h));
  color = mix(color, zenith, smoothstep(0.34, 0.92, h));

  float horizonGlow = exp(-abs(d.y) * 9.0);
  color += horizon * horizonGlow * 0.35;

  float n = fbm(d * 3.0 + vec3(0.0, uTime * 0.012, 0.0));
  float n2 = fbm(d * 6.0 - vec3(uTime * 0.009, 0.0, 0.0));
  float nebula = smoothstep(0.50, 0.86, n) * smoothstep(0.32, 0.82, n2);
  vec3 nebulaColor = mix(vec3(0.18, 0.05, 0.40), vec3(0.04, 0.30, 0.46), n2);
  color += nebulaColor * nebula * 0.90 * (1.0 - smoothstep(0.58, 1.0, h));

  float alpha = smoothstep(0.25, 1.0, uValue);
  gl_FragColor = vec4(color, alpha);
}
`;

const STAR_VERTEX = `
uniform float uTime;
attribute float aSize;
attribute float aPhase;
varying float vTwinkle;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (60.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
  vTwinkle = 0.65 + 0.35 * sin(uTime * 1.4 + aPhase);
}
`;

const STAR_FRAGMENT = `
uniform float uStars;
varying float vTwinkle;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  float core = smoothstep(0.5, 0.04, d);
  float glow = smoothstep(0.5, 0.0, d);
  vec3 color = mix(vec3(0.62, 0.82, 1.0), vec3(1.0), core);
  gl_FragColor = vec4(color, glow * uStars * vTwinkle);
}
`;

const PARTICLE_VERTEX = `
uniform float uTime;
attribute float aSize;
attribute float aPhase;
attribute vec3 aColor;
varying vec3 vColor;
varying float vTwinkle;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = aSize * (180.0 / max(1.0, -mv.z));
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  vTwinkle = 0.7 + 0.3 * sin(uTime * 1.1 + aPhase);
}
`;

const PARTICLE_FRAGMENT = `
uniform float uOpacity;
varying vec3 vColor;
varying float vTwinkle;
void main() {
  vec2 c = gl_PointCoord - vec2(0.5);
  float d = length(c);
  float glow = smoothstep(0.5, 0.0, d);
  float core = smoothstep(0.22, 0.0, d);
  vec3 color = vColor * (0.8 + 0.8 * core);
  gl_FragColor = vec4(color, glow * uOpacity * vTwinkle);
}
`;

class TransitionAudio {
  private ctx: AudioContext | null = null;
  private filter: BiquadFilterNode | null = null;
  private whooshGain: GainNode | null = null;
  private lowGain: GainNode | null = null;
  private sources: Array<AudioBufferSourceNode | OscillatorNode> = [];

  ensure(): void {
    if (this.ctx != null) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;

    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 180;
    filter.Q.value = 0.8;
    const whooshGain = ctx.createGain();
    whooshGain.gain.value = 0;
    noise.connect(filter).connect(whooshGain).connect(ctx.destination);
    noise.start();
    this.filter = filter;
    this.whooshGain = whooshGain;
    this.sources.push(noise);

    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = 55;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0;
    low.connect(lowGain).connect(ctx.destination);
    low.start();
    this.lowGain = lowGain;
    this.sources.push(low);
    void ctx.resume();
  }

  update(value: number): void {
    const ctx = this.ctx;
    if (ctx == null || this.whooshGain == null || this.filter == null || this.lowGain == null) {
      return;
    }
    const t = ctx.currentTime;
    this.whooshGain.gain.setTargetAtTime(
      Math.sin(Math.PI * value) * 0.09,
      t,
      0.05,
    );
    this.filter.frequency.setTargetAtTime(180 + 1600 * value, t, 0.05);
    this.lowGain.gain.setTargetAtTime(
      smoothstep(0.6, 1, value) * 0.06,
      t,
      0.1,
    );
  }

  dispose(): void {
    for (const source of this.sources) {
      try {
        source.stop();
      } catch {
        // already stopped
      }
    }
    this.sources = [];
    if (this.ctx != null) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

interface MembranePlane {
  mesh: Mesh;
  role: 'front' | 'back' | 'left' | 'right';
}

interface CloudSprite {
  mesh: Mesh;
  material: MeshBasicMaterial;
  base: Vector3;
  phase: number;
  speed: number;
  width: number;
  height: number;
}

/**
 * Dial-driven transition: a world-space dissolve membrane sweeps inward from
 * the room shell while Cloud geometry is revealed behind it. The same value
 * controls the visual, audio, and stable-state easing, so scrubbing and
 * reversal are continuous.
 */
export class RealityDialSystem extends createSystem({
  dial: { required: [RealityDial] },
}) {
  private dialEntity: Entity | undefined;
  private dialObject: Object3D | undefined;
  private needlePivot: Object3D | undefined;
  private elapsed = 0;
  private inputScrubbing = false;

  private handPinching = false;
  private handPinchStartX = 0;
  private handPinchStartValue = 0;
  private handPosition = new Vector3();
  private tmpQuat = new Quaternion();
  private anchor = new Vector3();

  private planeGeometry!: PlaneGeometry;
  private membraneMaterial!: ShaderMaterial;
  private membranePlanes: MembranePlane[] = [];

  private cloudGroup!: Group;
  private gridMaterial!: ShaderMaterial;
  private skyMaterial!: ShaderMaterial;
  private starMaterial!: ShaderMaterial;
  private cloudSprites: CloudSprite[] = [];
  private cloudTexture!: CanvasTexture;

  private particleGeometry!: BufferGeometry;
  private particleMaterial!: ShaderMaterial;
  private particlePositions!: Float32Array;
  private particleVelocities!: Float32Array;

  private audio = new TransitionAudio();
  private audioStarted = false;

  init(): void {
    this.dialEntity = this.queries.dial.entities.values().next().value;
    this.buildDialVisual();
    this.buildMembrane();
    this.buildCloud();
    this.publish(0, 0, false);
    this.applyTransition(0, 0);
    this.cleanupFuncs.push(
      () => this.audio.dispose(),
      () => {
        this.planeGeometry.dispose();
        this.membraneMaterial.dispose();
      },
    );
  }

  private buildDialVisual(): void {
    const dial = new Group();
    dial.name = 'reality-dial';
    const entity = this.world.createTransformEntity(dial);
    if (entity.object3D == null) {
      return;
    }
    entity.object3D.position.set(0, 0.95, -1.25);
    entity.object3D.scale.setScalar(0.18);
    this.dialObject = entity.object3D;

    const disc = new Mesh(
      new CircleGeometry(0.66, 32),
      new MeshBasicMaterial({
        color: new Color(0x0b1520),
        transparent: true,
        opacity: 0.6,
        side: DoubleSide,
      }),
    );
    disc.position.z = -0.02;
    dial.add(disc);

    const ring = new Mesh(
      new TorusGeometry(0.7, 0.045, 8, 48),
      new MeshBasicMaterial({
        color: new Color(0x4b5a6e),
        transparent: true,
        opacity: 0.95,
      }),
    );
    dial.add(ring);

    const ticks: Array<[number, number, number]> = [
      [-0.7, 0, 0x8b98a8],
      [0, 0.7, 0xf0b45a],
      [0.7, 0, 0x6fe6ff],
    ];
    for (const [x, y, color] of ticks) {
      const tick = new Mesh(
        new SphereGeometry(0.05, 10, 8),
        new MeshBasicMaterial({ color: new Color(color) }),
      );
      tick.position.set(x, y, 0.01);
      dial.add(tick);
    }

    const pivot = new Group();
    const needle = new Mesh(
      new BoxGeometry(0.045, 0.52, 0.02),
      new MeshBasicMaterial({ color: new Color(0xe8f6ff) }),
    );
    needle.position.y = 0.26;
    pivot.add(needle);
    dial.add(pivot);
    this.needlePivot = pivot;

    const hub = new Mesh(
      new SphereGeometry(0.075, 12, 10),
      new MeshBasicMaterial({ color: new Color(0x9fe8ff) }),
    );
    dial.add(hub);
  }

  private buildMembrane(): void {
    this.planeGeometry = new PlaneGeometry(1, 1);
    this.membraneMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      blending: AdditiveBlending,
      uniforms: {
        uValue: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: MEMBRANE_VERTEX,
      fragmentShader: MEMBRANE_FRAGMENT,
    });

    const roles: MembranePlane['role'][] = ['front', 'back', 'left', 'right'];
    for (const role of roles) {
      const mesh = new Mesh(this.planeGeometry, this.membraneMaterial);
      mesh.name = `dissolve-membrane-${role}`;
      const entity = this.world.createTransformEntity(mesh);
      if (entity.object3D == null) {
        continue;
      }
      mesh.position.y = ROOM_H / 2;
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.membranePlanes.push({ mesh, role });
    }
  }

  private buildCloud(): void {
    const group = new Group();
    group.name = 'cloud-world';
    const groupEntity = this.world.createTransformEntity(group);
    if (groupEntity.object3D == null) {
      return;
    }
    this.cloudGroup = group;

    const dome = new Mesh(
      new SphereGeometry(30, 48, 24),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: BackSide,
        uniforms: {
          uValue: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: DOME_VERTEX,
        fragmentShader: DOME_FRAGMENT,
      }),
    );
    dome.name = 'cloud-dome';
    dome.renderOrder = -10;
    this.skyMaterial = dome.material as ShaderMaterial;
    group.add(dome);

    const starCount = 900;
    const starPositions = new Float32Array(starCount * 3);
    const starSizes = new Float32Array(starCount);
    const starPhases = new Float32Array(starCount);
    let starSeed = 20271;
    const starRand = (): number => {
      starSeed = (starSeed * 1664525 + 1013904223) >>> 0;
      return starSeed / 4294967296;
    };
    for (let i = 0; i < starCount; i++) {
      const u = starRand() * 2 - 1;
      const theta = starRand() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const radius = 27 + starRand() * 2.2;
      starPositions[i * 3] = s * Math.cos(theta) * radius;
      starPositions[i * 3 + 1] = u * radius * 0.85 + 3.0;
      starPositions[i * 3 + 2] = s * Math.sin(theta) * radius;
      starSizes[i] = 0.8 + starRand() * 1.7;
      starPhases[i] = starRand() * Math.PI * 2;
    }
    const starGeometry = new BufferGeometry();
    starGeometry.setAttribute('position', new BufferAttribute(starPositions, 3));
    starGeometry.setAttribute('aSize', new BufferAttribute(starSizes, 1));
    starGeometry.setAttribute('aPhase', new BufferAttribute(starPhases, 1));
    this.starMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uStars: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: STAR_VERTEX,
      fragmentShader: STAR_FRAGMENT,
    });
    const stars = new Points(starGeometry, this.starMaterial);
    stars.name = 'cloud-stars';
    stars.frustumCulled = false;
    stars.renderOrder = -9;
    group.add(stars);

    const grid = new Mesh(
      new PlaneGeometry(26, 26),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: DoubleSide,
        uniforms: {
          uValue: { value: 0 },
          uTime: { value: 0 },
          uFogFar: { value: 6 },
        },
        vertexShader: GRID_VERTEX,
        fragmentShader: GRID_FRAGMENT,
      }),
    );
    grid.rotation.x = -Math.PI / 2;
    grid.position.y = 0.004;
    grid.name = 'cloud-grid';
    grid.renderOrder = -8;
    this.gridMaterial = grid.material as ShaderMaterial;
    group.add(grid);

    this.cloudTexture = this.createCloudTexture();
    let spriteSeed = 7717;
    const spriteRand = (): number => {
      spriteSeed = (spriteSeed * 1664525 + 1013904223) >>> 0;
      return spriteSeed / 4294967296;
    };
    for (let i = 0; i < 24; i++) {
      const angle = i * 2.399963 + spriteRand() * 0.5;
      const radius = 2.8 + (i % 7) * 1.5 + spriteRand() * 0.8;
      const base = new Vector3(
        Math.cos(angle) * radius,
        0.8 + spriteRand() * 3.8,
        Math.sin(angle) * radius,
      );
      const width = 1.4 + spriteRand() * 3.0;
      const height = width * (0.5 + spriteRand() * 0.35);
      const color =
        i % 3 === 0 ? 0x9fe8ff : i % 3 === 1 ? 0x6fb8ff : 0xc9b6ff;
      const material = new MeshBasicMaterial({
        map: this.cloudTexture,
        color: new Color(color),
        transparent: true,
        opacity: 0,
        depthWrite: false,
        side: DoubleSide,
      });
      const mesh = new Mesh(this.planeGeometry, material);
      mesh.name = `cloud-sprite-${i}`;
      mesh.frustumCulled = false;
      mesh.renderOrder = -7;
      mesh.position.copy(base);
      mesh.scale.set(width, height, 1);
      group.add(mesh);
      this.cloudSprites.push({
        mesh,
        material,
        base,
        phase: spriteRand() * Math.PI * 2,
        speed: 0.08 + spriteRand() * 0.12,
        width,
        height,
      });
    }

    const particleCount = 320;
    this.particlePositions = new Float32Array(particleCount * 3);
    this.particleVelocities = new Float32Array(particleCount * 3);
    const particleSizes = new Float32Array(particleCount);
    const particlePhases = new Float32Array(particleCount);
    const particleColors = new Float32Array(particleCount * 3);
    let particleSeed = 991;
    const particleRand = (): number => {
      particleSeed = (particleSeed * 1664525 + 1013904223) >>> 0;
      return particleSeed / 4294967296;
    };
    const palette = [0x9fe8ff, 0xffffff, 0xbfa8ff];
    for (let i = 0; i < particleCount; i++) {
      let x = 0;
      let y = 0;
      let z = 0;
      let vx = 0;
      let vy = 0;
      let vz = 0;
      if (i < 120) {
        const side = i % 4;
        const t = particleRand() * 2 - 1;
        y = 0.2 + particleRand() * 2.2;
        if (side === 0) {
          x = t * ROOM_HX;
          z = -ROOM_HZ;
        } else if (side === 1) {
          x = t * ROOM_HX;
          z = ROOM_HZ;
        } else if (side === 2) {
          x = -ROOM_HX;
          z = t * ROOM_HZ;
        } else {
          x = ROOM_HX;
          z = t * ROOM_HZ;
        }
        const len = Math.hypot(x, z) || 1;
        vx = (x / len) * (0.05 + particleRand() * 0.05);
        vy = 0.02 + particleRand() * 0.04;
        vz = (z / len) * (0.05 + particleRand() * 0.05);
      } else {
        const angle = particleRand() * Math.PI * 2;
        const radius = 0.8 + particleRand() * 6.5;
        x = Math.cos(angle) * radius;
        y = 0.5 + particleRand() * 3.4;
        z = Math.sin(angle) * radius;
        vx = (particleRand() - 0.5) * 0.02;
        vy = 0.005 + particleRand() * 0.015;
        vz = (particleRand() - 0.5) * 0.02;
      }
      this.particlePositions[i * 3] = x;
      this.particlePositions[i * 3 + 1] = y;
      this.particlePositions[i * 3 + 2] = z;
      this.particleVelocities[i * 3] = vx;
      this.particleVelocities[i * 3 + 1] = vy;
      this.particleVelocities[i * 3 + 2] = vz;
      particleSizes[i] = 0.035 + particleRand() * 0.06;
      particlePhases[i] = particleRand() * Math.PI * 2;
      const color = new Color(palette[i % palette.length]);
      particleColors[i * 3] = color.r;
      particleColors[i * 3 + 1] = color.g;
      particleColors[i * 3 + 2] = color.b;
    }
    this.particleGeometry = new BufferGeometry();
    this.particleGeometry.setAttribute(
      'position',
      new BufferAttribute(this.particlePositions, 3),
    );
    this.particleGeometry.setAttribute(
      'aSize',
      new BufferAttribute(particleSizes, 1),
    );
    this.particleGeometry.setAttribute(
      'aPhase',
      new BufferAttribute(particlePhases, 1),
    );
    this.particleGeometry.setAttribute(
      'aColor',
      new BufferAttribute(particleColors, 3),
    );
    this.particleMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: AdditiveBlending,
      uniforms: {
        uOpacity: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: PARTICLE_VERTEX,
      fragmentShader: PARTICLE_FRAGMENT,
    });
    const particles = new Points(this.particleGeometry, this.particleMaterial);
    particles.name = 'cloud-particles';
    particles.renderOrder = -6;
    this.cloudGroup.add(particles);
  }

  private createCloudTexture(): CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (ctx == null) {
      return new CanvasTexture(canvas);
    }
    ctx.clearRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'lighter';
    let seed = 4242;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 26; i++) {
      const x = size * (0.2 + rand() * 0.6);
      const y = size * (0.25 + rand() * 0.5);
      const r = size * (0.08 + rand() * 0.22);
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      gradient.addColorStop(0.45, 'rgba(190, 238, 255, 0.18)');
      gradient.addColorStop(1, 'rgba(120, 200, 255, 0)');
      ctx.fillStyle = gradient;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    texture.needsUpdate = true;
    return texture;
  }

  update(delta: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      return;
    }
    this.elapsed += delta;
    this.dialEntity = this.queries.dial.entities.values().next().value;
    if (this.dialEntity == null) {
      return;
    }

    let value = this.dialEntity.getValue(RealityDial, 'value') ?? 0;
    let target = this.dialEntity.getValue(RealityDial, 'target') ?? 0;
    let scrubbing =
      this.dialEntity.getValue(RealityDial, 'scrubbing') === true;

    const axis = this.readStickAxis();
    const left = this.input.gamepads.left;
    if (left?.getSelectStart() === true) {
      this.handPinching = true;
      this.handPinchStartX = this.readHandX();
      this.handPinchStartValue = value;
      this.startAudio();
    }
    if (left?.getSelectEnd() === true && this.handPinching) {
      this.handPinching = false;
      scrubbing = false;
      target = nearestStable(value);
    }

    if (this.handPinching) {
      const dx = this.readHandX() - this.handPinchStartX;
      value = clamp01(this.handPinchStartValue + dx / HAND_SWEEP_METERS);
      target = value;
      scrubbing = true;
      this.inputScrubbing = true;
    } else if (axis !== 0) {
      value = clamp01(value + axis * DIAL_SPEED * delta);
      target = value;
      scrubbing = true;
      this.inputScrubbing = true;
      this.startAudio();
    } else if (this.inputScrubbing) {
      this.inputScrubbing = false;
      scrubbing = false;
      target = nearestStable(value);
    }

    if (!scrubbing) {
      value = moveToward(value, target, delta / EASE_SECONDS);
    }

    const head = this.player.head;
    if (head != null) {
      head.updateWorldMatrix(true, false);
      this.anchor.setFromMatrixPosition(head.matrixWorld);
      this.anchor.y = 0;
    }
    if (this.dialObject != null) {
      this.dialObject.position.set(
        this.anchor.x,
        0.95,
        this.anchor.z - 1.25,
      );
    }

    this.publish(value, target, scrubbing);
    if (this.needlePivot != null) {
      this.needlePivot.rotation.z = -Math.PI / 2 + value * Math.PI;
    }
    this.applyTransition(value, delta);
    this.audio.update(value);
  }

  private startAudio(): void {
    if (this.audioStarted) {
      return;
    }
    this.audioStarted = true;
    this.audio.ensure();
  }

  private publish(value: number, target: number, scrubbing: boolean): void {
    if (this.dialEntity == null) {
      return;
    }
    this.dialEntity.setValue(RealityDial, 'value', value);
    this.dialEntity.setValue(RealityDial, 'target', target);
    this.dialEntity.setValue(RealityDial, 'scrubbing', scrubbing);
    this.dialEntity.setValue(RealityDial, 'zone', zoneFor(value));
  }

  private applyTransition(value: number, delta: number): void {
    const v = clamp01(value);
    const front = v * (Math.min(ROOM_HX, ROOM_HZ) - 0.1);
    const width = Math.max(0.12, 2 * (ROOM_HX - front));
    const depth = Math.max(0.12, 2 * (ROOM_HZ - front));
    const membraneVisible = v > 0.001 && v < 0.995;

    this.membraneMaterial.uniforms['uValue'].value = v;
    this.membraneMaterial.uniforms['uTime'].value = this.elapsed;
    for (const plane of this.membranePlanes) {
      const mesh = plane.mesh;
      mesh.visible = membraneVisible;
      if (plane.role === 'front') {
        mesh.position.set(
          this.anchor.x,
          ROOM_H / 2,
          this.anchor.z - (ROOM_HZ - front),
        );
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(width, ROOM_H, 1);
      } else if (plane.role === 'back') {
        mesh.position.set(
          this.anchor.x,
          ROOM_H / 2,
          this.anchor.z + ROOM_HZ - front,
        );
        mesh.rotation.set(0, Math.PI, 0);
        mesh.scale.set(width, ROOM_H, 1);
      } else if (plane.role === 'left') {
        mesh.position.set(
          this.anchor.x - (ROOM_HX - front),
          ROOM_H / 2,
          this.anchor.z,
        );
        mesh.rotation.set(0, Math.PI / 2, 0);
        mesh.scale.set(depth, ROOM_H, 1);
      } else {
        mesh.position.set(
          this.anchor.x + ROOM_HX - front,
          ROOM_H / 2,
          this.anchor.z,
        );
        mesh.rotation.set(0, -Math.PI / 2, 0);
        mesh.scale.set(depth, ROOM_H, 1);
      }
    }

    if (this.cloudGroup != null) {
      this.cloudGroup.visible = v > 0.001;
      this.cloudGroup.position.set(this.anchor.x, 0, this.anchor.z);
    }
    if (this.gridMaterial != null) {
      this.gridMaterial.uniforms['uValue'].value = v;
      this.gridMaterial.uniforms['uTime'].value = this.elapsed;
      this.gridMaterial.uniforms['uFogFar'].value = 5 + 16 * v;
    }
    if (this.skyMaterial != null) {
      this.skyMaterial.uniforms['uValue'].value = v;
      this.skyMaterial.uniforms['uTime'].value = this.elapsed;
    }
    if (this.starMaterial != null) {
      this.starMaterial.uniforms['uStars'].value = smoothstep(0.3, 0.92, v);
      this.starMaterial.uniforms['uTime'].value = this.elapsed;
    }

    const spriteGate = smoothstep(0.22, 0.9, v);
    this.world.camera.updateWorldMatrix(true, false);
    this.world.camera.getWorldQuaternion(this.tmpQuat);
    for (const cloud of this.cloudSprites) {
      const dist = cloud.base.length();
      const fog = 1 - smoothstep(7, 18 + 8 * v, dist);
      cloud.material.opacity = spriteGate * fog * 0.38;
      cloud.mesh.position.set(
        cloud.base.x +
          Math.sin(this.elapsed * cloud.speed + cloud.phase) * 0.35,
        cloud.base.y +
          Math.sin(this.elapsed * cloud.speed * 0.7 + cloud.phase) * 0.18,
        cloud.base.z +
          Math.cos(this.elapsed * cloud.speed * 0.8 + cloud.phase) * 0.35,
      );
      cloud.mesh.quaternion.copy(this.tmpQuat);
      const breathe = 0.94 + 0.06 * Math.sin(this.elapsed * 0.3 + cloud.phase);
      cloud.mesh.scale.set(
        cloud.width * breathe,
        cloud.height * breathe,
        1,
      );
    }

    const particleGate = smoothstep(0.05, 0.55, v);
    if (this.particleMaterial != null) {
      this.particleMaterial.uniforms['uOpacity'].value = particleGate * 0.85;
      this.particleMaterial.uniforms['uTime'].value = this.elapsed;
      if (v > 0.001) {
        for (let i = 0; i < this.particlePositions.length; i += 3) {
          this.particlePositions[i] += this.particleVelocities[i] * delta;
          this.particlePositions[i + 1] +=
            this.particleVelocities[i + 1] * delta;
          this.particlePositions[i + 2] +=
            this.particleVelocities[i + 2] * delta;
          this.particleVelocities[i] *= 0.999;
          this.particleVelocities[i + 1] *= 0.999;
          this.particleVelocities[i + 2] *= 0.999;
        }
        this.particleGeometry.attributes.position.needsUpdate = true;
      }
    }
  }

  private readStickAxis(): number {
    let axis = 0;
    const stick = this.input.gamepads.left?.getAxesValues(
      InputComponent.Thumbstick,
    );
    if (stick != null && Math.abs(stick.x) > DEADZONE) {
      axis = stick.x;
    }
    if (
      this.input.keyboard?.getKeyPressed('ArrowRight') === true ||
      this.input.keyboard?.getKeyPressed('KeyD') === true
    ) {
      axis = 1;
    }
    if (
      this.input.keyboard?.getKeyPressed('ArrowLeft') === true ||
      this.input.keyboard?.getKeyPressed('KeyA') === true
    ) {
      axis = -1;
    }
    return axis;
  }

  private readHandX(): number {
    const grip = this.player.gripSpaces.left;
    if (grip == null) {
      return 0;
    }
    grip.updateWorldMatrix(true, false);
    this.handPosition.setFromMatrixPosition(grip.matrixWorld);
    return this.handPosition.x;
  }
}
