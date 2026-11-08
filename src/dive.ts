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
  CircleGeometry,
  Color,
  createSystem,
  DoubleSide,
  Entity,
  EnvironmentRaycastTarget,
  Mesh,
  MeshBasicMaterial,
  Object3D,
  PlaneGeometry,
  Points,
  PointsMaterial,
  Pressed,
  Quaternion,
  RaycastSpace,
  RayInteractable,
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

const DISSOLVE_SECONDS = 3;
const RETURN_SECONDS = 2;
const GOO_SECONDS = 2.2;
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

const GOO_VERTEX = `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const GOO_FRAGMENT = `
uniform float uGoo;
uniform float uTime;
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
  float alpha = 1.0 - smoothstep(edge - 0.12, edge, r);
  if (alpha < 0.004) {
    discard;
  }
  float h = clamp(0.5 - c.y, 0.0, 1.0);
  vec3 deep = mix(vec3(0.02, 0.01, 0.07), vec3(0.10, 0.03, 0.22), h);
  vec2 g = floor(vUv * 90.0);
  float star = step(0.978, hash(g)) * (0.5 + 0.5 * sin(uTime * 3.0 + hash(g + 7.0) * 6.28));
  float rim = smoothstep(edge - 0.16, edge - 0.02, r) * (1.0 - smoothstep(edge - 0.02, edge, r));
  vec3 col = deep + vec3(0.9, 0.95, 1.0) * star + vec3(0.25, 0.8, 1.0) * rim * 0.9;
  gl_FragColor = vec4(col, alpha);
}
`;

/**
 * Wall-scan pinch dive: finds the vertical real-world wall ahead, marks it
 * with a pulsing orb, and on pinch (or trigger / mouse press) grows a gooey
 * deep-space portal on the wall that hands off to the full-space transition.
 */
export class DiveSystem extends createSystem({
  dive: { required: [DiveControl] },
  portal: { required: [WallPortal] },
  walls: { required: [XRPlane] },
  pressed: { required: [Pressed] },
}) {
  private phase: DivePhase = 'Room';
  private progress = 0;
  private portalPhase: PortalPhase = 'Scanning';
  private goo = 0;

  private diveEntity: Entity | undefined;
  private portalEntity: Entity | undefined;

  private markerEntity: Entity | undefined;
  private markerObj: Object3D | undefined;
  private markerMat: MeshBasicMaterial | undefined;
  private hitEntity: Entity | undefined;

  private portalObj: Object3D | undefined;
  private portalMat: ShaderMaterial | undefined;

  private fallbackWallObj: Object3D | undefined;

  private frontWall: Entity | undefined;
  private frontWallOriginalMaterial: unknown;
  private highlightMat: MeshBasicMaterial | undefined;

  private domeObj!: Object3D;
  private domeMat!: ShaderMaterial;
  private domeEntity: Entity | undefined;
  private starsObj!: Object3D;
  private starsMat!: PointsMaterial;
  private ringObjs: Object3D[] = [];
  private ringMats: MeshBasicMaterial[] = [];

  private wallPoint = new Vector3(0, 1.5, -2.5);
  private wallNormal = new Vector3(0, 0, 1);
  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private tmpForward = new Vector3();
  private tmpQuat = new Quaternion();
  private elapsed = 0;

  init(): void {
    this.diveEntity = this.queries.dive.entities.values().next().value;
    this.portalEntity = this.queries.portal.entities.values().next().value;

    const hitObj = new Object3D();
    this.hitEntity = this.world.createTransformEntity(hitObj);
    this.hitEntity.addComponent(EnvironmentRaycastTarget, {
      space: RaycastSpace.Viewer,
      maxDistance: 12,
    });

    const markerMat = new MeshBasicMaterial({
      color: new Color(0x46e0ff),
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    });
    this.markerMat = markerMat;
    const marker = new Mesh(new SphereGeometry(0.055, 20, 14), markerMat);
    const markerEntity = this.world.createTransformEntity(marker);
    markerEntity.addComponent(RayInteractable);
    if (markerEntity.object3D != null) {
      this.markerEntity = markerEntity;
      this.markerObj = markerEntity.object3D;
      this.markerObj.name = 'wall-marker';
      this.markerObj.position.copy(this.wallPoint);
    }

    this.portalMat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      uniforms: {
        uGoo: { value: 0 },
        uTime: { value: 0 },
      },
      vertexShader: GOO_VERTEX,
      fragmentShader: GOO_FRAGMENT,
    });
    const portal = new Mesh(new CircleGeometry(1, 48), this.portalMat);
    const portalEntity = this.world.createTransformEntity(portal);
    if (portalEntity.object3D != null) {
      this.portalObj = portalEntity.object3D;
      this.portalObj.name = 'wall-portal';
      this.portalObj.visible = false;
    }

    const fallbackMat = new MeshBasicMaterial({
      color: new Color(0x5a6b8c),
      transparent: true,
      opacity: 0.35,
      side: DoubleSide,
      depthWrite: false,
    });
    const fallback = new Mesh(new PlaneGeometry(4, 2.5), fallbackMat);
    const fallbackEntity = this.world.createTransformEntity(fallback);
    if (fallbackEntity.object3D != null) {
      this.fallbackWallObj = fallbackEntity.object3D;
      this.fallbackWallObj.name = 'fallback-wall';
      this.fallbackWallObj.position.set(0, 1.4, -2.5);
      this.fallbackWallObj.visible = false;
    }

    this.highlightMat = new MeshBasicMaterial({
      color: new Color(0x46e0ff),
      transparent: true,
      opacity: 0.22,
      side: DoubleSide,
      depthWrite: false,
    });

    this.buildDeepSpace();
    this.queries.pressed.subscribe('qualify', (entity) => this.onPressed(entity));
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
    domeEntity.addComponent(RayInteractable);
    this.domeEntity = domeEntity;
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

  private onPressed(entity: Entity): void {
    if (this.markerEntity != null && entity === this.markerEntity) {
      if (this.phase === 'Room') {
        this.requestDive();
      }
      return;
    }
    if (this.domeEntity != null && entity === this.domeEntity) {
      if (this.phase === 'DeepSpace') {
        this.requestReturn();
      }
    }
  }

  private requestDive(): void {
    if (this.phase !== 'Room') {
      return;
    }
    this.snapRingsToHead();
    this.placePortal();
    this.setPortalPhase('Goo');
  }

  private requestReturn(): void {
    if (this.phase !== 'DeepSpace') {
      return;
    }
    this.setPhase('Returning');
    this.setPortalPhase('Scanning');
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

  private placePortal(): void {
    if (this.portalObj == null) {
      return;
    }
    this.portalObj.position
      .copy(this.wallPoint)
      .addScaledVector(this.wallNormal, 0.02);
    this.tmpA.copy(this.wallPoint).add(this.wallNormal);
    this.portalObj.lookAt(this.tmpA);
    this.portalObj.visible = true;
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

  update(delta: number): void {
    if (this.world.visibilityState.peek() === VisibilityState.VisibleBlurred) {
      return;
    }
    this.elapsed += delta;

    this.scanWalls();

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
      if (this.goo >= 1) {
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
      if (this.progress <= 0) {
        this.goo = 0;
        this.portalEntity?.setValue(WallPortal, 'goo', 0);
        this.setPhase('Room');
      }
    }

    this.driveVisuals(delta);
  }

  private scanWalls(): void {
    const head = this.player.head;
    if (head == null) {
      return;
    }
    head.updateWorldMatrix(true, false);
    this.tmpB.setFromMatrixPosition(head.matrixWorld);
    head.getWorldQuaternion(this.tmpQuat);
    this.tmpForward.set(0, 0, -1).applyQuaternion(this.tmpQuat);

    let best: Entity | undefined;
    let bestDist = Infinity;
    for (const entity of this.queries.walls.entities) {
      const native = entity.getValue(XRPlane, '_plane') as
        | { orientation?: string }
        | undefined;
      if (native?.orientation !== 'vertical') {
        continue;
      }
      const obj = entity.object3D;
      if (obj == null) {
        continue;
      }
      obj.updateWorldMatrix(true, false);
      this.tmpA.setFromMatrixPosition(obj.matrixWorld).sub(this.tmpB);
      const dist = this.tmpA.length();
      this.tmpA.normalize();
      if (this.tmpA.dot(this.tmpForward) < 0.5) {
        continue;
      }
      if (dist < bestDist) {
        bestDist = dist;
        best = entity;
      }
    }

    if (best !== this.frontWall) {
      this.restoreWallMaterial();
      this.frontWall = best;
    }

    const roomPhase = this.phase === 'Room';

    if (this.frontWall != null) {
      const obj = this.frontWall.object3D;
      if (obj != null && obj instanceof Mesh) {
        if (this.frontWallOriginalMaterial === undefined) {
          this.frontWallOriginalMaterial = obj.material;
        }
        if (obj.material !== this.highlightMat && this.highlightMat != null) {
          obj.material = this.highlightMat as unknown as typeof obj.material;
        }
      }
      obj?.updateWorldMatrix(true, false);
      if (obj != null) {
        this.tmpA.setFromMatrixPosition(obj.matrixWorld);
        obj.getWorldQuaternion(this.tmpQuat);
        this.tmpC.set(0, 0, 1).applyQuaternion(this.tmpQuat);
        this.tmpForward.copy(this.tmpB).sub(this.tmpA);
        if (this.tmpC.dot(this.tmpForward) < 0) {
          this.tmpC.negate();
        }
        this.wallPoint.copy(this.tmpA);
        this.wallNormal.copy(this.tmpC);
      }
    }

    const hitValid =
      this.hitEntity?.getValue(EnvironmentRaycastTarget, 'xrHitTestResult') !=
      null;
    if (this.markerObj != null) {
      const showMarker = roomPhase;
      this.markerObj.visible = showMarker;
      if (showMarker) {
        if (hitValid && this.hitEntity?.object3D != null) {
          this.markerObj.position.copy(this.hitEntity.object3D.position);
          this.wallPoint.copy(this.markerObj.position);
          if (this.hitEntity.object3D.quaternion != null) {
            this.tmpC
              .set(0, 0, 1)
              .applyQuaternion(this.hitEntity.object3D.quaternion);
            this.wallNormal.copy(this.tmpC);
          }
        } else if (this.frontWall == null) {
          this.markerObj.position.set(0, 1.4, -2.5);
          this.wallPoint.set(0, 1.4, -2.5);
          this.wallNormal.set(0, 0, 1);
        }
        const s = 1 + 0.18 * Math.sin(this.elapsed * 4);
        this.markerObj.scale.set(s, s, s);
      }
    }

    if (this.portalEntity != null) {
      const view = this.portalEntity.getVectorView(WallPortal, 'wallPoint');
      view[0] = this.wallPoint.x;
      view[1] = this.wallPoint.y;
      view[2] = this.wallPoint.z;
      const nview = this.portalEntity.getVectorView(WallPortal, 'wallNormal');
      nview[0] = this.wallNormal.x;
      nview[1] = this.wallNormal.y;
      nview[2] = this.wallNormal.z;
    }

    if (this.fallbackWallObj != null) {
      this.fallbackWallObj.visible = roomPhase && this.frontWall == null;
    }
  }

  private restoreWallMaterial(): void {
    if (
      this.frontWall != null &&
      this.frontWallOriginalMaterial !== undefined
    ) {
      const obj = this.frontWall.object3D;
      if (obj != null && obj instanceof Mesh) {
        obj.material =
          this.frontWallOriginalMaterial as unknown as typeof obj.material;
      }
    }
    this.frontWall = undefined;
    this.frontWallOriginalMaterial = undefined;
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

    if (this.portalObj != null && this.portalMat != null) {
      const gooing = this.portalPhase === 'Goo';
      const open = this.portalPhase === 'Open';
      this.portalMat.uniforms['uGoo'].value = this.goo;
      this.portalMat.uniforms['uTime'].value += delta;
      if (gooing) {
        const s = 0.25 + easeOutCubic(this.goo) * 1.5;
        this.portalObj.scale.set(s, s, s);
        this.portalObj.visible = true;
      } else if (open && this.phase === 'Dissolving') {
        const s = 1.75 + easeOutCubic(p) * 4;
        this.portalObj.scale.set(s, s, s);
        this.portalObj.visible = p < 0.85;
      } else {
        this.portalObj.visible = false;
      }
    }

    if (this.markerMat != null) {
      this.markerMat.opacity = 0.75 + 0.2 * Math.sin(this.elapsed * 4);
    }
    if (this.highlightMat != null && this.frontWall != null) {
      this.highlightMat.opacity = 0.18 + 0.08 * Math.sin(this.elapsed * 2.5);
    }
  }
}
