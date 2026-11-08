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
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Quaternion,
  RingGeometry,
  ShaderMaterial,
  SphereGeometry,
  Vector3,
  VisibilityState,
  XRPlane,
} from '@iwsdk/core';
import { DiveControl } from './dive-component.js';
import { WallPortal } from './wall-portal-component.js';

type DivePhase = 'Room' | 'Dissolving' | 'DeepSpace' | 'Returning';
type PortalPhase = 'Idle' | 'Scanning' | 'Goo' | 'Open';

const GOO_SECONDS = 4.5;
const DISSOLVE_SECONDS = 5;
const RETURN_SECONDS = 3;
const RING_COUNT = 2;
const WALL_OFFSET = 0.012;

interface WallPatch {
  entity: Entity;
  obj: Mesh;
  localCenter: Vector3;
  width: number;
  height: number;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
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

const WALL_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// One material shared by every wall patch. uScan draws the subtle wall grid
// while the app is mapping surfaces; uGoo grows the organic space portal.
const WALL_FRAGMENT = `
uniform float uGoo;
uniform float uTime;
uniform float uScan;
varying vec2 vUv;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

void main() {
  vec2 c = vUv - vec2(0.5);
  float r = length(c) * 2.0;
  float a = atan(c.y, c.x);

  float wobble = sin(a * 5.0 + uTime * 2.2) * 0.5
    + sin(a * 9.0 - uTime * 3.1) * 0.3
    + sin(a * 3.0 + uTime * 1.4) * 0.2;
  float edge = uGoo * (1.0 + 0.16 * wobble);
  float gooAlpha = 1.0 - smoothstep(edge - 0.12, edge, r);

  vec2 grid = abs(fract(vUv * vec2(12.0, 8.0)) - 0.5);
  float border = max(grid.x, grid.y);
  float line = smoothstep(0.42, 0.5, border);
  float scanAlpha = line * uScan
    * (0.16 + 0.08 * sin(uTime * 1.6 + vUv.x * 7.0 + vUv.y * 5.0));

  float alpha = max(gooAlpha, scanAlpha);
  if (alpha < 0.004) {
    discard;
  }

  float h = clamp(0.5 - c.y, 0.0, 1.0);
  vec3 deep = mix(vec3(0.02, 0.01, 0.07), vec3(0.10, 0.03, 0.22), h);
  vec2 cell = fract(vUv * 140.0) - 0.5;
  float star = step(0.985, hash(floor(vUv * 140.0)))
    * smoothstep(0.16, 0.0, length(cell))
    * (0.5 + 0.5 * sin(uTime * 3.0 + hash(floor(vUv * 140.0)) * 6.28));
  float rim = smoothstep(edge - 0.16, edge - 0.02, r)
    * (1.0 - smoothstep(edge - 0.02, edge, r));
  vec3 gooColor = deep
    + vec3(0.9, 0.95, 1.0) * star
    + vec3(0.25, 0.8, 1.0) * rim * 0.9;
  vec3 scanColor = vec3(0.25, 0.85, 1.0);

  vec3 color = mix(scanColor, gooColor, clamp(gooAlpha * 3.0, 0.0, 1.0));
  gl_FragColor = vec4(color, alpha);
}
`;

/**
 * Wall-driven pinch dive. Vertical XR planes are mapped into visible scan
 * grids; pinching grows a gooey space portal from every detected wall at once,
 * then the room dissolves into deep space.
 */
export class DiveSystem extends createSystem({
  dive: { required: [DiveControl] },
  portal: { required: [WallPortal] },
  walls: { required: [XRPlane] },
}) {
  private phase: DivePhase = 'Room';
  private progress = 0;
  private portalPhase: PortalPhase = 'Scanning';
  private goo = 0;

  private diveEntity: Entity | undefined;
  private portalEntity: Entity | undefined;

  private patchGeometry!: PlaneGeometry;
  private patchMaterial!: ShaderMaterial;
  private patches = new Map<Entity, WallPatch>();
  private fallbackPatches: WallPatch[] = [];
  private fallbackCenter = new Vector3();
  private noWallSeconds = 0;
  private noWallWarned = false;
  private patchCounter = 0;

  private domeObj!: Object3D;
  private domeMat!: ShaderMaterial;
  private starsObj!: Object3D;
  private starsMat!: PointsMaterial;
  private ringObjs: Object3D[] = [];
  private ringMats: MeshBasicMaterial[] = [];

  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private tmpHead = new Vector3();
  private tmpQuat = new Quaternion();
  private tmpQuatFlip = new Quaternion();
  private nearestPoint = new Vector3();
  private nearestNormal = new Vector3();
  private elapsed = 0;

  init(): void {
    this.diveEntity = this.queries.dive.entities.values().next().value;
    this.portalEntity = this.queries.portal.entities.values().next().value;

    this.patchGeometry = new PlaneGeometry(1, 1);
    this.patchMaterial = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uGoo: { value: 0 },
        uTime: { value: 0 },
        uScan: { value: 1 },
      },
      vertexShader: WALL_VERTEX,
      fragmentShader: WALL_FRAGMENT,
    });
    this.tmpQuatFlip.setFromAxisAngle(new Vector3(0, 1, 0), Math.PI);

    this.buildDeepSpace();

    this.cleanupFuncs.push(
      this.queries.walls.subscribe('qualify', (entity) =>
        this.ensurePatch(entity),
      ),
      this.queries.walls.subscribe('disqualify', (entity) =>
        this.removePatch(entity),
      ),
      () => {
        for (const entity of [...this.patches.keys()]) {
          this.removePatch(entity);
        }
        this.disposeFallback();
        this.patchGeometry.dispose();
        this.patchMaterial.dispose();
      },
    );

    this.queries.walls.entities.forEach((entity) => this.ensurePatch(entity));
    this.setPortalPhase('Scanning');
    this.setPhase('Room');
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

  private ensurePatch(planeEntity: Entity): void {
    if (this.patches.has(planeEntity)) {
      return;
    }
    const plane = planeEntity.getValue(XRPlane, '_plane') as
      | { orientation?: string }
      | undefined;
    if (plane?.orientation !== 'vertical') {
      return;
    }
    const planeObject = planeEntity.object3D;
    if (!(planeObject instanceof Mesh)) {
      return;
    }
    const geometry = planeObject.geometry;
    geometry.computeBoundingBox();
    const box = geometry.boundingBox;
    if (box == null) {
      return;
    }
    const size = box.getSize(new Vector3());
    const localCenter = box.getCenter(new Vector3());
    const width = clamp(size.x, 1.2, 8);
    const height = clamp(size.y, 1.0, 5);

    const patch = new Mesh(this.patchGeometry, this.patchMaterial);
    patch.name = `wall-goo-${this.patchCounter++}`;
    const entity = this.world.createTransformEntity(patch);
    if (entity.object3D == null) {
      return;
    }
    this.patches.set(planeEntity, {
      entity,
      obj: patch,
      localCenter,
      width,
      height,
    });
    this.syncPatch(planeEntity);
  }

  private removePatch(planeEntity: Entity): void {
    const patch = this.patches.get(planeEntity);
    if (patch == null) {
      return;
    }
    patch.entity.destroy();
    this.patches.delete(planeEntity);
  }

  // Move every wall patch onto its plane's current world pose and keep the
  // visible face turned toward the viewer.
  private syncPatch(planeEntity: Entity): void {
    const patch = this.patches.get(planeEntity);
    const planeObject = planeEntity.object3D;
    const head = this.player.head;
    if (patch == null || planeObject == null || head == null) {
      return;
    }
    planeObject.updateWorldMatrix(true, false);
    head.updateWorldMatrix(true, false);
    this.tmpHead.setFromMatrixPosition(head.matrixWorld);

    this.tmpA.copy(patch.localCenter).applyMatrix4(planeObject.matrixWorld);
    this.tmpQuat.setFromRotationMatrix(planeObject.matrixWorld);
    this.tmpB.set(0, 0, 1).applyQuaternion(this.tmpQuat);
    this.tmpC.copy(this.tmpHead).sub(this.tmpA);
    if (this.tmpB.dot(this.tmpC) < 0) {
      this.tmpQuat.multiply(this.tmpQuatFlip);
      this.tmpB.negate();
    }
    patch.obj.position.copy(this.tmpA).addScaledVector(this.tmpB, WALL_OFFSET);
    patch.obj.quaternion.copy(this.tmpQuat);
    patch.obj.scale.set(patch.width, patch.height, 1);
  }

  private ensureFallback(): void {
    const head = this.player.head;
    if (head == null) {
      return;
    }
    head.updateWorldMatrix(true, false);
    this.tmpHead.setFromMatrixPosition(head.matrixWorld);
    if (
      this.fallbackPatches.length > 0 &&
      this.fallbackCenter.distanceToSquared(this.tmpHead) < 0.36
    ) {
      return;
    }
    this.disposeFallback();
    this.fallbackCenter.copy(this.tmpHead);

    const y = 1.4;
    const d = 2.8;
    const width = 4.5;
    const height = 2.6;
    const specs: Array<[number, number, number, Quaternion]> = [
      [0, y, -d, new Quaternion()],
      [0, y, d, new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI)],
      [
        -d,
        y,
        0,
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI / 2),
      ],
      [
        d,
        y,
        0,
        new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -Math.PI / 2),
      ],
    ];
    for (const [px, , pz, quat] of specs) {
      const patch = new Mesh(this.patchGeometry, this.patchMaterial);
      patch.name = `wall-goo-fallback-${this.patchCounter++}`;
      patch.position.set(
        this.tmpHead.x + px,
        this.tmpHead.y - 0.2,
        this.tmpHead.z + pz,
      );
      patch.quaternion.copy(quat);
      patch.scale.set(width, height, 1);
      const entity = this.world.createTransformEntity(patch);
      if (entity.object3D == null) {
        continue;
      }
      this.fallbackPatches.push({
        entity,
        obj: patch,
        localCenter: new Vector3(),
        width,
        height,
      });
    }
  }

  private disposeFallback(): void {
    for (const patch of this.fallbackPatches) {
      patch.entity.destroy();
    }
    this.fallbackPatches.length = 0;
  }

  private setPhase(phase: DivePhase): void {
    this.phase = phase;
    this.diveEntity?.setValue(DiveControl, 'phase', phase);
    this.diveEntity?.setValue(DiveControl, 'progress', this.progress);
  }

  private setPortalPhase(phase: PortalPhase): void {
    this.portalPhase = phase;
    this.portalEntity?.setValue(WallPortal, 'phase', phase);
    this.portalEntity?.setValue(WallPortal, 'goo', this.goo);
  }

  private requestDive(): void {
    if (this.phase !== 'Room') {
      return;
    }
    this.goo = 0;
    this.snapRingsToHead();
    this.setPortalPhase('Goo');
  }

  private requestReturn(): void {
    if (this.phase !== 'DeepSpace') {
      return;
    }
    this.setPortalPhase('Scanning');
    this.setPhase('Returning');
  }

  private snapRingsToHead(): void {
    const head = this.player.head;
    if (head == null) {
      return;
    }
    head.updateWorldMatrix(true, false);
    this.tmpA.setFromMatrixPosition(head.matrixWorld);
    for (const ring of this.ringObjs) {
      ring.position.set(this.tmpA.x, 1.2, this.tmpA.z);
    }
  }

  update(delta: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      return;
    }
    this.elapsed += delta;

    this.syncWalls(delta);

    const leftSelect = this.input.gamepads.left?.getSelectStart() === true;
    const rightSelect = this.input.gamepads.right?.getSelectStart() === true;
    const spaceDown = this.input.keyboard?.getKeyDown('Space') === true;
    if (leftSelect || rightSelect || spaceDown) {
      if (this.phase === 'Room') {
        this.requestDive();
      } else if (this.phase === 'DeepSpace') {
        this.requestReturn();
      }
    }

    if (this.portalPhase === 'Goo') {
      this.goo = Math.min(1, this.goo + delta / GOO_SECONDS);
      this.portalEntity?.setValue(WallPortal, 'goo', this.goo);
      if (this.goo >= 0.85 && this.phase === 'Room') {
        this.setPortalPhase('Open');
        this.setPhase('Dissolving');
      }
    }

    if (this.phase === 'Dissolving') {
      this.progress = Math.min(1, this.progress + delta / DISSOLVE_SECONDS);
      if (this.progress >= 1) {
        this.setPhase('DeepSpace');
      }
    } else if (this.phase === 'Returning') {
      this.progress = Math.max(0, this.progress - delta / RETURN_SECONDS);
      this.goo = Math.max(0, this.goo - delta / RETURN_SECONDS);
      this.portalEntity?.setValue(WallPortal, 'goo', this.goo);
      if (this.progress <= 0) {
        this.goo = 0;
        this.portalEntity?.setValue(WallPortal, 'goo', 0);
        this.setPortalPhase('Scanning');
        this.setPhase('Room');
      }
    }

    this.driveVisuals(delta);
  }

  private syncWalls(delta: number): void {
    const head = this.player.head;
    if (head == null) {
      return;
    }
    head.updateWorldMatrix(true, false);
    this.tmpHead.setFromMatrixPosition(head.matrixWorld);

    let hasVertical = false;
    let nearestDist = Infinity;
    let foundNearest = false;

    for (const planeEntity of this.queries.walls.entities) {
      const plane = planeEntity.getValue(XRPlane, '_plane') as
        | { orientation?: string }
        | undefined;
      if (plane?.orientation !== 'vertical') {
        continue;
      }
      hasVertical = true;
      if (!this.patches.has(planeEntity)) {
        this.ensurePatch(planeEntity);
      }
      this.syncPatch(planeEntity);
      const patch = this.patches.get(planeEntity);
      if (patch == null) {
        continue;
      }
      const dist = patch.obj.position.distanceToSquared(this.tmpHead);
      if (dist < nearestDist) {
        nearestDist = dist;
        foundNearest = true;
        this.nearestPoint.copy(patch.obj.position);
        this.nearestNormal
          .set(0, 0, 1)
          .applyQuaternion(patch.obj.quaternion);
      }
    }

    if (hasVertical) {
      this.noWallSeconds = 0;
      this.disposeFallback();
    } else {
      this.noWallSeconds += delta;
      const immersive =
        this.world.visibilityState.peek() !== VisibilityState.NonImmersive;
      if (!immersive || this.noWallSeconds > 1.5) {
        this.ensureFallback();
      }
      if (immersive && !this.noWallWarned && this.noWallSeconds > 3) {
        this.noWallWarned = true;
        console.warn(
          '[Dive] No vertical walls detected. Complete Space Setup so the app can scan your room.',
        );
      }
    }

    if (this.portalEntity != null) {
      const view = this.portalEntity.getVectorView(WallPortal, 'wallPoint');
      const normal = this.portalEntity.getVectorView(WallPortal, 'wallNormal');
      if (foundNearest) {
        view[0] = this.nearestPoint.x;
        view[1] = this.nearestPoint.y;
        view[2] = this.nearestPoint.z;
        normal[0] = this.nearestNormal.x;
        normal[1] = this.nearestNormal.y;
        normal[2] = this.nearestNormal.z;
      } else {
        view[0] = this.tmpHead.x;
        view[1] = 1.4;
        view[2] = this.tmpHead.z - 2.8;
        normal[0] = 0;
        normal[1] = 0;
        normal[2] = 1;
      }
    }
  }

  private driveVisuals(delta: number): void {
    const p = this.progress;

    const scan =
      this.phase === 'Room'
        ? 1
        : this.phase === 'Returning'
          ? smoothstep(0.55, 0, this.goo)
          : 0;
    this.patchMaterial.uniforms['uGoo'].value = this.goo;
    this.patchMaterial.uniforms['uScan'].value = scan;
    this.patchMaterial.uniforms['uTime'].value += delta;

    const patchesVisible = this.phase !== 'DeepSpace';
    for (const patch of this.patches.values()) {
      patch.obj.visible = patchesVisible;
    }
    for (const patch of this.fallbackPatches) {
      patch.obj.visible = patchesVisible;
    }

    const domeMix = smoothstep(0.05, 1, p);
    this.domeMat.uniforms['uMix'].value = domeMix;
    this.domeMat.uniforms['uTime'].value += delta;
    this.domeObj.visible = domeMix > 0.002;

    const starOpacity = smoothstep(0.35, 1, p);
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
      this.ringMats[i].opacity = transitioning ? (1 - rp) * 0.55 : 0;
      this.ringObjs[i].visible = transitioning && rp < 1;
    }
  }
}
