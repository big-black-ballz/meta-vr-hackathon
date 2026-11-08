/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AdditiveBlending,
  BackSide,
  BufferAttribute,
  BufferGeometry,
  Color,
  createSystem,
  DoubleSide,
  Entity,
  Euler,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  UIKitMLAsset,
  Vector3,
  VisibilityState,
} from '@iwsdk/core';
import { DiveControl } from './dive-component.js';

type DivePhase = 'Room' | 'Dissolving' | 'DeepSpace' | 'Returning';

const DISSOLVE_SECONDS = 3;
const RETURN_SECONDS = 2;
const RING_COUNT = 2;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp01((v - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function easeOutCubic(t: number): number {
  const u = 1 - t;
  return 1 - u * u * u;
}

const DOME_VERTEX = `
varying vec3 vDirection;
void main() {
  vDirection = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const DOME_FRAGMENT = `
uniform float uMix;
uniform float uTime;
varying vec3 vDirection;
void main() {
  vec3 d = normalize(vDirection);
  float h = d.y * 0.5 + 0.5;
  vec3 deep = mix(vec3(0.012, 0.008, 0.045), vec3(0.05, 0.02, 0.14), h);
  float band = sin(d.x * 9.0 + uTime * 0.15)
    * sin(d.y * 7.0 - uTime * 0.10)
    * sin(d.z * 8.0 + uTime * 0.12);
  float nebula = smoothstep(0.15, 0.95, band) * 0.5;
  vec3 col = deep
    + vec3(0.16, 0.06, 0.38) * nebula
    + vec3(0.02, 0.10, 0.16) * (1.0 - h) * 0.4;
  gl_FragColor = vec4(col, uMix);
}
`;

/**
 * Owns the room-to-deep-space transition: POV HUD + hand-panel wiring,
 * left-hand follow in XR, and the dissolve animation (shockwave rings,
 * crossfading nebula dome, fading starfield).
 */
export class DiveSystem extends createSystem({
  dive: { required: [DiveControl] },
}) {
  private phase: DivePhase = 'Room';
  private progress = 0;

  private hud!: UIKitMLAsset;
  private hand!: UIKitMLAsset;
  private diveEntity: Entity | undefined;
  private wired = false;

  private handObj: Object3D | undefined;
  private handHomePosition = new Vector3();
  private handHomeQuaternion = new Quaternion();
  private followingHand = false;

  private domeObj!: Object3D;
  private domeMat!: ShaderMaterial;
  private starsObj!: Object3D;
  private starsMat!: PointsMaterial;
  private ringObjs: Object3D[] = [];
  private ringMats: MeshBasicMaterial[] = [];

  private tmpPos = new Vector3();
  private tmpHead = new Vector3();
  private tmpEuler = new Euler();

  private onDive = () => this.requestDive();
  private onReturn = () => this.requestReturn();

  init(): void {
    this.hud = this.world.requireSceneObject<UIKitMLAsset>('hud-panel');
    this.hand = this.world.requireSceneObject<UIKitMLAsset>('hand-panel');
    this.diveEntity = this.queries.dive.entities.values().next().value;

    const hudDive = this.hud.getElementById('btn-dive');
    const hudReturn = this.hud.getElementById('btn-return');
    const handDive = this.hand.getElementById('btn-dive-hand');
    const handReturn = this.hand.getElementById('btn-return-hand');
    hudDive?.addEventListener('click', this.onDive);
    hudReturn?.addEventListener('click', this.onReturn);
    handDive?.addEventListener('click', this.onDive);
    handReturn?.addEventListener('click', this.onReturn);
    this.cleanupFuncs.push(
      () => hudDive?.removeEventListener('click', this.onDive),
      () => hudReturn?.removeEventListener('click', this.onReturn),
      () => handDive?.removeEventListener('click', this.onDive),
      () => handReturn?.removeEventListener('click', this.onReturn),
    );

    const handEntity = this.world.requireSceneEntity('hand-panel');
    this.handObj = handEntity.object3D ?? undefined;
    if (this.handObj != null) {
      this.handHomePosition.copy(this.handObj.position);
      this.handHomeQuaternion.copy(this.handObj.quaternion);
    }

    this.buildDeepSpace();
    this.tryWire();
    this.setPhase('Room');
  }

  /**
   * UIKitML documents may not be parsed on the first frame, so element
   * lookup can return null during init. Retry every frame until all four
   * buttons resolve, then attach listeners exactly once.
   */
  private tryWire(): void {
    if (this.wired) {
      return;
    }
    const hudDive = this.hud.getElementById('btn-dive');
    const hudReturn = this.hud.getElementById('btn-return');
    const handDive = this.hand.getElementById('btn-dive-hand');
    const handReturn = this.hand.getElementById('btn-return-hand');
    if (
      hudDive == null ||
      hudReturn == null ||
      handDive == null ||
      handReturn == null
    ) {
      return;
    }
    hudDive.addEventListener('click', this.onDive);
    hudReturn.addEventListener('click', this.onReturn);
    handDive.addEventListener('click', this.onDive);
    handReturn.addEventListener('click', this.onReturn);
    this.cleanupFuncs.push(
      () => hudDive.removeEventListener('click', this.onDive),
      () => hudReturn.removeEventListener('click', this.onReturn),
      () => handDive.removeEventListener('click', this.onDive),
      () => handReturn.removeEventListener('click', this.onReturn),
    );
    this.wired = true;
  }

  private buildDeepSpace(): void {
    this.domeMat = new ShaderMaterial({
      side: BackSide,
      transparent: true,
      depthWrite: false,
      uniforms: {
        uMix: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: DOME_VERTEX,
      fragmentShader: DOME_FRAGMENT,
    });
    const dome = new Mesh(new SphereGeometry(60, 32, 16), this.domeMat);
    dome.frustumCulled = false;
    const domeEntity = this.world.createTransformEntity(dome);
    if (domeEntity.object3D == null) {
      return;
    }
    this.domeObj = domeEntity.object3D;
    this.domeObj.name = 'dive-dome';
    this.domeObj.position.set(0, 1.5, 0);
    this.domeObj.visible = false;

    let seed = 1337;
    const rand = (): number => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const starCount = 700;
    const positions = new Float32Array(starCount * 3);
    for (let i = 0; i < starCount; i++) {
      const radius = 38 + rand() * 17;
      const u = rand() * 2 - 1;
      const theta = rand() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      positions[i * 3] = s * Math.cos(theta) * radius;
      positions[i * 3 + 1] = u * radius * 0.7 + 6;
      positions[i * 3 + 2] = s * Math.sin(theta) * radius;
    }
    const starGeo = new BufferGeometry();
    starGeo.setAttribute('position', new BufferAttribute(positions, 3));
    this.starsMat = new PointsMaterial({
      color: new Color(0xbfd4ff),
      size: 0.18,
      sizeAttenuation: true,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const stars = new Points(starGeo, this.starsMat);
    stars.frustumCulled = false;
    const starsEntity = this.world.createTransformEntity(stars);
    if (starsEntity.object3D == null) {
      return;
    }
    this.starsObj = starsEntity.object3D;
    this.starsObj.name = 'dive-stars';
    this.starsObj.visible = false;

    const ringColors = [0x46e0ff, 0x9a6bff];
    for (let i = 0; i < RING_COUNT; i++) {
      const mat = new MeshBasicMaterial({
        color: new Color(ringColors[i]),
        transparent: true,
        opacity: 0,
        side: DoubleSide,
        blending: AdditiveBlending,
        depthWrite: false,
      });
      const ring = new Mesh(new RingGeometry(0.95, 1, 72), mat);
      ring.rotation.x = -Math.PI / 2;
      const ringEntity = this.world.createTransformEntity(ring);
      if (ringEntity.object3D == null) {
        continue;
      }
      ringEntity.object3D.name = `dive-ring-${i}`;
      ringEntity.object3D.visible = false;
      this.ringObjs.push(ringEntity.object3D);
      this.ringMats.push(mat);
    }
  }

  private requestDive(): void {
    if (this.phase === 'DeepSpace' || this.phase === 'Dissolving') {
      return;
    }
    this.snapRingsToHead();
    this.setPhase('Dissolving');
  }

  private requestReturn(): void {
    if (this.phase === 'Room' || this.phase === 'Returning') {
      return;
    }
    this.snapRingsToHead();
    this.setPhase('Returning');
  }

  private snapRingsToHead(): void {
    const head = this.player.head;
    if (head == null) {
      return;
    }
    head.updateWorldMatrix(true, false);
    this.tmpHead.setFromMatrixPosition(head.matrixWorld);
    for (const ring of this.ringObjs) {
      ring.position.set(this.tmpHead.x, 1.2, this.tmpHead.z);
    }
  }

  private setPhase(phase: DivePhase): void {
    this.phase = phase;
    this.diveEntity?.setValue(DiveControl, 'phase', phase);
    this.diveEntity?.setValue(DiveControl, 'progress', this.progress);

    const statusText =
      phase === 'Room'
        ? 'Your Room'
        : phase === 'DeepSpace'
          ? 'Deep Space'
          : phase === 'Dissolving'
            ? 'Dissolving...'
            : 'Returning...';
    const showDive = phase === 'Room' || phase === 'Returning';
    this.hud.getElementById('hud-status')?.setProperties({ text: statusText });
    this.hand.getElementById('hand-status')?.setProperties({ text: statusText });
    this.hud
      .getElementById('btn-dive')
      ?.setProperties({ display: showDive ? 'flex' : 'none' });
    this.hud
      .getElementById('btn-return')
      ?.setProperties({ display: showDive ? 'none' : 'flex' });
    this.hand
      .getElementById('btn-dive-hand')
      ?.setProperties({ display: showDive ? 'flex' : 'none' });
    this.hand
      .getElementById('btn-return-hand')
      ?.setProperties({ display: showDive ? 'none' : 'flex' });
  }

  update(delta: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      return;
    }

    if (!this.wired) {
      this.tryWire();
    }

    if (this.phase === 'Dissolving') {
      this.progress = Math.min(1, this.progress + delta / DISSOLVE_SECONDS);
      if (this.progress >= 1) {
        this.setPhase('DeepSpace');
      }
    } else if (this.phase === 'Returning') {
      this.progress = Math.max(0, this.progress - delta / RETURN_SECONDS);
      if (this.progress <= 0) {
        this.setPhase('Room');
      }
    }

    this.driveVisuals(delta);
    this.followHand();
  }

  private driveVisuals(delta: number): void {
    const p = this.progress;

    const domeMix = smoothstep(0.2, 0.95, p);
    this.domeMat.uniforms['uMix'].value = domeMix;
    this.domeMat.uniforms['uTime'].value += delta;
    this.domeObj.visible = domeMix > 0.002;

    const starOpacity = smoothstep(0.45, 1, p);
    this.starsMat.opacity = starOpacity;
    this.starsObj.visible = starOpacity > 0.002;
    if (this.starsObj.visible) {
      this.starsObj.rotation.y += delta * 0.02;
    }

    const transitioning =
      this.phase === 'Dissolving' || this.phase === 'Returning';
    for (let i = 0; i < this.ringObjs.length; i++) {
      const rp = clamp01((p - i * 0.18) / 0.55);
      const s = 0.6 + easeOutCubic(rp) * 7.5;
      this.ringObjs[i].scale.set(s, s, s);
      this.ringMats[i].opacity = transitioning ? (1 - rp) * 0.7 : 0;
      this.ringObjs[i].visible = transitioning && rp < 1;
    }
  }

  private followHand(): void {
    if (this.handObj == null) {
      return;
    }
    const immersive =
      this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
    if (!immersive) {
      if (this.followingHand) {
        this.handObj.position.copy(this.handHomePosition);
        this.handObj.quaternion.copy(this.handHomeQuaternion);
        this.followingHand = false;
      }
      return;
    }

    const grip = this.player.gripSpaces.left;
    const head = this.player.head;
    if (grip == null || head == null) {
      return;
    }
    grip.updateWorldMatrix(true, false);
    head.updateWorldMatrix(true, false);
    this.tmpPos.setFromMatrixPosition(grip.matrixWorld);
    this.tmpHead.setFromMatrixPosition(head.matrixWorld);
    this.handObj.position.set(this.tmpPos.x, this.tmpPos.y + 0.12, this.tmpPos.z);
    const yaw = Math.atan2(
      this.tmpHead.x - this.handObj.position.x,
      this.tmpHead.z - this.handObj.position.z,
    );
    this.handObj.quaternion.setFromEuler(this.tmpEuler.set(0, yaw, 0));
    this.followingHand = true;
  }
}
