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
  CircleGeometry,
  Color,
  createSystem,
  CylinderGeometry,
  DoubleSide,
  Entity,
  Group,
  InputComponent,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  ShaderMaterial,
  SphereGeometry,
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
  vec2 g = abs(fract(p * 1.4) - 0.5);
  float line = 1.0 - smoothstep(0.45, 0.5, max(g.x, g.y));
  float gate = smoothstep(0.15, 0.9, uValue);
  float dist = length(vWorld.xz);
  float fog = 1.0 - smoothstep(4.0, uFogFar, dist);
  float pulse = 0.35 + 0.15 * sin(uTime * 0.8 + p.x * 0.2 + p.y * 0.2);
  float alpha = line * gate * fog * pulse;
  vec3 color = mix(vec3(0.16, 0.52, 0.82), vec3(0.80, 0.95, 1.0), fog);
  gl_FragColor = vec4(color, alpha);
}
`;

const SKY_VERTEX = `
varying vec3 vWorld;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorld = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

const SKY_FRAGMENT = `
uniform float uValue;
uniform float uTime;
varying vec3 vWorld;

void main() {
  float h = clamp(vWorld.y / 16.0, 0.0, 1.0);
  vec3 horizon = vec3(0.05, 0.13, 0.23);
  vec3 zenith = vec3(0.01, 0.03, 0.09);
  vec3 color = mix(horizon, zenith, h);
  float band = 0.5 + 0.5 * sin(vWorld.x * 0.08 + uTime * 0.08 + vWorld.z * 0.06);
  color += vec3(0.03, 0.07, 0.11) * band * (1.0 - h) * 0.6;
  float alpha = smoothstep(0.25, 1.0, uValue);
  gl_FragColor = vec4(color, alpha);
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

interface CloudShape {
  mesh: Mesh;
  base: Vector3;
  phase: number;
  speed: number;
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
  private needlePivot: Object3D | undefined;
  private elapsed = 0;
  private inputScrubbing = false;

  private handPinching = false;
  private handPinchStartX = 0;
  private handPinchStartValue = 0;
  private handPosition = new Vector3();

  private planeGeometry!: PlaneGeometry;
  private membraneMaterial!: ShaderMaterial;
  private membranePlanes: MembranePlane[] = [];

  private cloudGroup!: Group;
  private gridMaterial!: ShaderMaterial;
  private skyMaterial!: ShaderMaterial;
  private cloudShapes: CloudShape[] = [];

  private particleGeometry!: BufferGeometry;
  private particleMaterial!: PointsMaterial;
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

    const sky = new Mesh(
      new CylinderGeometry(24, 24, 60, 48, 1, true),
      new ShaderMaterial({
        transparent: true,
        depthWrite: false,
        side: BackSide,
        uniforms: {
          uValue: { value: 0 },
          uTime: { value: 0 },
        },
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
      }),
    );
    sky.position.y = 30;
    sky.name = 'cloud-sky';
    this.skyMaterial = sky.material as ShaderMaterial;
    group.add(sky);

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
    this.gridMaterial = grid.material as ShaderMaterial;
    group.add(grid);

    const shapeGeometry = new SphereGeometry(0.55, 7, 5);
    for (let i = 0; i < 12; i++) {
      const angle = i * 2.399963;
      const radius = 3.4 + (i % 4) * 1.4;
      const color = i % 3 === 0 ? 0x9fe8ff : i % 3 === 1 ? 0x4a8fc7 : 0xbfeeff;
      const material = new MeshBasicMaterial({
        color: new Color(color),
        transparent: true,
        opacity: 0,
        depthWrite: false,
      });
      const mesh = new Mesh(shapeGeometry, material);
      const base = new Vector3(
        Math.cos(angle) * radius,
        0.8 + ((i * 0.37) % 3.0),
        Math.sin(angle) * radius,
      );
      mesh.position.copy(base);
      const scale = 0.5 + ((i * 0.23) % 1.0);
      mesh.scale.setScalar(scale);
      mesh.name = `cloud-shape-${i}`;
      group.add(mesh);
      this.cloudShapes.push({
        mesh,
        base,
        phase: i * 0.7,
        speed: 0.15 + (i % 5) * 0.04,
      });
    }

    const particleCount = 220;
    this.particlePositions = new Float32Array(particleCount * 3);
    this.particleVelocities = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const side = i % 4;
      const t = ((i * 0.61803398875) % 1) * 2 - 1;
      const y = 0.2 + ((i * 0.37) % 1) * 2.2;
      let x = 0;
      let z = 0;
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
      this.particlePositions[i * 3] = x;
      this.particlePositions[i * 3 + 1] = y;
      this.particlePositions[i * 3 + 2] = z;
      const len = Math.hypot(x, z) || 1;
      this.particleVelocities[i * 3] = (x / len) * (0.08 + (i % 5) * 0.01);
      this.particleVelocities[i * 3 + 1] = 0.03 + (i % 3) * 0.015;
      this.particleVelocities[i * 3 + 2] = (z / len) * (0.08 + (i % 5) * 0.01);
    }
    this.particleGeometry = new BufferGeometry();
    this.particleGeometry.setAttribute(
      'position',
      new BufferAttribute(this.particlePositions, 3),
    );
    this.particleMaterial = new PointsMaterial({
      color: new Color(0x9fe8ff),
      size: 0.05,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      blending: AdditiveBlending,
    });
    const particles = new Points(this.particleGeometry, this.particleMaterial);
    particles.name = 'cloud-particles';
    this.cloudGroup.add(particles);
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
        mesh.position.set(0, ROOM_H / 2, -(ROOM_HZ - front));
        mesh.rotation.set(0, 0, 0);
        mesh.scale.set(width, ROOM_H, 1);
      } else if (plane.role === 'back') {
        mesh.position.set(0, ROOM_H / 2, ROOM_HZ - front);
        mesh.rotation.set(0, Math.PI, 0);
        mesh.scale.set(width, ROOM_H, 1);
      } else if (plane.role === 'left') {
        mesh.position.set(-(ROOM_HX - front), ROOM_H / 2, 0);
        mesh.rotation.set(0, Math.PI / 2, 0);
        mesh.scale.set(depth, ROOM_H, 1);
      } else {
        mesh.position.set(ROOM_HX - front, ROOM_H / 2, 0);
        mesh.rotation.set(0, -Math.PI / 2, 0);
        mesh.scale.set(depth, ROOM_H, 1);
      }
    }

    if (this.cloudGroup != null) {
      this.cloudGroup.visible = v > 0.001;
    }
    if (this.gridMaterial != null) {
      this.gridMaterial.uniforms['uValue'].value = v;
      this.gridMaterial.uniforms['uTime'].value = this.elapsed;
      this.gridMaterial.uniforms['uFogFar'].value = 6 + 16 * v;
    }
    if (this.skyMaterial != null) {
      this.skyMaterial.uniforms['uValue'].value = v;
      this.skyMaterial.uniforms['uTime'].value = this.elapsed;
    }

    const shapeGate = smoothstep(0.25, 0.9, v);
    for (const shape of this.cloudShapes) {
      const material = shape.mesh.material as MeshBasicMaterial;
      const dist = shape.base.length();
      const fog = 1 - smoothstep(7, 18 + 8 * v, dist);
      material.opacity = shapeGate * fog * 0.75;
      shape.mesh.position.set(
        shape.base.x + Math.sin(this.elapsed * shape.speed + shape.phase) * 0.25,
        shape.base.y +
          Math.sin(this.elapsed * shape.speed * 0.7 + shape.phase) * 0.12,
        shape.base.z +
          Math.cos(this.elapsed * shape.speed * 0.8 + shape.phase) * 0.25,
      );
    }

    const particleGate = smoothstep(0.05, 0.55, v);
    if (this.particleMaterial != null) {
      this.particleMaterial.opacity = particleGate * 0.65;
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
