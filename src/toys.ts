/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  Color,
  ConeGeometry,
  createSystem,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Entity,
  Grabbed,
  GrabSystem,
  Group,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  OneHandGrabbable,
  PhysicsBody,
  PhysicsManipulation,
  PhysicsShape,
  PhysicsShapeType,
  PhysicsState,
  PhysicsSystem,
  PlaneGeometry,
  Quaternion,
  RingGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TorusGeometry,
  Vector3,
  XRPlane,
} from '@iwsdk/core';
import { RealityDial } from './reality-dial-component.js';
import { Toy, ToyKinds, type ToyKind } from './toy-component.js';

const MAX_TOYS = 30;
const SURFACE_THICKNESS = 0.06;
const MIN_PLANE_SIZE = 0.2;
const FALLBACK_DELAY = 3;
const LOG_INTERVAL = 1;
const HORIZONTAL_QUAT = new Quaternion().setFromAxisAngle(
  new Vector3(1, 0, 0),
  -Math.PI / 2,
);

interface SurfaceRecord {
  entity: Entity;
  mesh: Mesh;
  outline: LineSegments;
  outlineEntity: Entity;
  outlineMaterial: LineBasicMaterial;
  center: Vector3;
  quaternion: Quaternion;
  width: number;
  height: number;
  thickness: number;
  soft: boolean;
  label: string;
  source: 'plane' | 'virtual' | 'tray';
  planeEntity?: Entity;
  virtual: boolean;
  visibleMesh: boolean;
}

interface ToyRecord {
  entity: Entity;
  kind: ToyKind;
  mesh: Mesh;
  material: MeshStandardMaterial;
  restOffset: number;
  ghostScale: Vector3;
  spawnedAt: number;
  lastSpeed: number;
  impactCooldown: number;
  restTime: number;
  settled: boolean;
  fade: number;
}

interface ToySpec {
  density: number;
  restitution: number;
  friction: number;
  linearDamping: number;
  angularDamping: number;
  gravityFactor: number;
  shape: string;
  dimensions: [number, number, number];
  restOffset: number;
  ghostScale: Vector3;
}

class ToyAudio {
  private ctx: AudioContext | null = null;

  ensure(): void {
    if (this.ctx == null) {
      this.ctx = new AudioContext();
    }
    void this.ctx.resume();
  }

  impact(speed: number, soft: boolean): void {
    const ctx = this.ctx;
    if (ctx == null) {
      return;
    }
    const now = ctx.currentTime;
    const level = Math.min(1, Math.max(0.15, speed / 5));
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = soft ? 'sine' : 'triangle';
    osc.frequency.setValueAtTime(soft ? 72 : 420, now);
    if (!soft) {
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.05);
    }
    gain.gain.setValueAtTime(soft ? 0.06 * level : 0.035 * level, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + (soft ? 0.22 : 0.08));
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + (soft ? 0.24 : 0.1));
  }

  settle(): void {
    const ctx = this.ctx;
    if (ctx == null) {
      return;
    }
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1046, now);
    gain.gain.setValueAtTime(0.018, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.35);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.36);
  }

  dispose(): void {
    if (this.ctx != null) {
      void this.ctx.close();
      this.ctx = null;
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function smoothstep(edge0: number, edge1: number, v: number): number {
  const t = clamp((v - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function newSpec(
  density: number,
  restitution: number,
  friction: number,
  linearDamping: number,
  gravityFactor: number,
  shape: string,
  dimensions: [number, number, number],
  restOffset: number,
  ghostScale: Vector3,
): ToySpec {
  return {
    density,
    restitution,
    friction,
    linearDamping,
    angularDamping: 0.35,
    gravityFactor,
    shape,
    dimensions,
    restOffset,
    ghostScale,
  };
}

/**
 * Real-surface physics toys. Detected XRPlane surfaces become static box
 * colliders; a virtual bed/bench/shelf is used when no room scan is available.
 * Toys are IWSDK physics bodies with OneHandGrabbable, so pinch grabs and
 * release throws them naturally.
 */
export class ToySystem extends createSystem({
  planes: { required: [XRPlane] },
  toys: { required: [Toy] },
  held: { required: [Toy, Grabbed] },
  dial: { required: [RealityDial] },
}) {
  private surfaces: SurfaceRecord[] = [];
  private planeSurfaces = new Map<Entity, SurfaceRecord>();
  private virtualSurfaces: SurfaceRecord[] = [];
  private fallbackGroup: Group | undefined;
  private fallbackCreated = false;
  private fallbackFading = 0;
  private noPlaneTime = 0;
  private logTimer = 0;
  private lastPlaneSignature = '';

  private tray: SurfaceRecord | undefined;
  private trayCenter = new Vector3(0.55, 0.515, -0.75);
  private traySize = new Vector3(0.75, 0.03, 0.45);

  private toys: ToyRecord[] = [];
  private toyMap = new Map<Entity, ToyRecord>();
  private fading: ToyRecord[] = [];
  private toyCounter = 0;

  private heldEntity: Entity | undefined;
  private heldRecord: ToyRecord | undefined;
  private heldHand: 'left' | 'right' = 'right';
  private heldHandPosition = new Vector3();
  private previousHandPosition = new Vector3();
  private heldVelocity = new Vector3();
  private suppressThrowEntity: Entity | undefined;
  private gentleStart = -1;
  private leftPinching = false;
  private rightPinching = false;
  private bothPinchTime = 0;
  private lastLeftPinch = -10;

  private ghostRoot: Group | undefined;
  private ghostRing: Mesh | undefined;
  private ghostOutline: Mesh | undefined;
  private ghostPlacement: {
    position: Vector3;
    quaternion: Quaternion;
    normal: Vector3;
    surface: SurfaceRecord;
  } | null = null;

  private impactPulse: Mesh | undefined;
  private impactPulseLife = 0;

  private messageMesh: Mesh | undefined;
  private messageTexture: CanvasTexture | undefined;
  private messageTime = 0;
  private messageShown = false;

  private tmpA = new Vector3();
  private tmpB = new Vector3();
  private tmpC = new Vector3();
  private tmpQ = new Quaternion();
  private tmpQInv = new Quaternion();
  private tmpQuat = new Quaternion();
  private elapsed = 0;

  private audio = new ToyAudio();

  init(): void {
    this.buildGhost();
    this.buildTray();
    this.spawnInitialToys();
    this.buildMessage();

    this.queries.held.subscribe('qualify', (entity) => this.onGrab(entity));
    this.queries.held.subscribe('disqualify', (entity) => this.onRelease(entity));
    this.queries.planes.subscribe('disqualify', (entity) =>
      this.removePlaneSurface(entity),
    );

    this.cleanupFuncs.push(() => {
      this.audio.dispose();
      this.clearSurfaces();
      this.clearToys();
    });
  }

  update(delta: number): void {
    this.elapsed += delta;
    this.noPlaneTime += delta;
    this.syncPlaneSurfaces(delta);
    this.updateFallback(delta);
    this.updateTrayAndToys(delta);
    this.updateHeldToy(delta);
    this.updateImpacts(delta);
    this.updateGhost();
    this.updateCloudOutlines(delta);
    this.updateMessage(delta);
    this.logPlanes(delta);

    if (
      this.input.keyboard?.getKeyDown('KeyR') === true
    ) {
      this.resetToys();
    }
    if (this.input.keyboard?.getKeyDown('KeyN') === true) {
      this.spawnToy(this.randomKind(), this.nextSpawnPosition());
    }
    if (this.input.keyboard?.getKeyDown('KeyT') === true) {
      this.pullTrayToPlayer();
    }
    this.updateGestures(delta);
  }

  // ---------------------------------------------------------------- surfaces

  private syncPlaneSurfaces(delta: number): void {
    const planes = [...this.queries.planes.entities];
    const seen = new Set<Entity>();
    for (const planeEntity of planes) {
      const native = planeEntity.getValue(XRPlane, '_plane') as
        | {
            orientation?: 'horizontal' | 'vertical';
            semanticLabel?: string;
            lastChangedTime?: number;
          }
        | undefined;
      const planeObject = planeEntity.object3D;
      if (native == null || !(planeObject instanceof Mesh)) {
        continue;
      }
      const label = (native.semanticLabel ?? '').toLowerCase();
      if (label === 'ceiling') {
        continue;
      }
      const geometry = planeObject.geometry;
      geometry.computeBoundingBox();
      const box = geometry.boundingBox;
      if (box == null) {
        continue;
      }
      const size = box.getSize(new Vector3());
      if (size.x < MIN_PLANE_SIZE || size.y < MIN_PLANE_SIZE) {
        continue;
      }
      seen.add(planeEntity);
      planeObject.updateWorldMatrix(true, false);
      const worldCenter = box
        .getCenter(new Vector3())
        .applyMatrix4(planeObject.matrixWorld);
      const quaternion = planeObject.getWorldQuaternion(new Quaternion());
      const normal = new Vector3(0, 0, 1).applyQuaternion(quaternion);
      if (native.orientation === 'horizontal' && normal.y < 0) {
        quaternion.multiply(
          new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), Math.PI),
        );
        normal.negate();
      }
      const soft = /bed|couch|sofa|mattress|soft/.test(label);
      const surfaceLabel =
        label ||
        (native.orientation === 'vertical'
          ? 'wall'
          : worldCenter.y < 0.25
            ? 'floor'
            : 'table');
      const existing = this.planeSurfaces.get(planeEntity);
      if (
        existing != null &&
        Math.abs(existing.width - size.x) < 0.05 &&
        Math.abs(existing.height - size.y) < 0.05
      ) {
        this.setSurfacePose(
          existing,
          worldCenter,
          quaternion,
          normal,
          surfaceLabel,
          soft,
        );
        continue;
      }
      if (existing != null) {
        this.removePlaneSurface(planeEntity);
      }
      const surface = this.createSurface({
        center: worldCenter,
        quaternion,
        normal,
        width: size.x,
        height: size.y,
        thickness: SURFACE_THICKNESS,
        soft,
        label: surfaceLabel,
        source: 'plane',
        visible: false,
      });
      if (surface != null) {
        surface.planeEntity = planeEntity;
        this.planeSurfaces.set(planeEntity, surface);
      }
    }

    for (const [planeEntity] of this.planeSurfaces) {
      if (!seen.has(planeEntity)) {
        this.removePlaneSurface(planeEntity);
      }
    }

    if (this.planeSurfaces.size > 0 && this.fallbackCreated) {
      this.beginFallbackFade();
    }
  }

  private setSurfacePose(
    surface: SurfaceRecord,
    center: Vector3,
    quaternion: Quaternion,
    normal: Vector3,
    label: string,
    soft: boolean,
  ): void {
    surface.label = label;
    surface.soft = soft;
    surface.quaternion.copy(quaternion);
    surface.center.copy(center).addScaledVector(normal, -surface.thickness / 2);
    surface.mesh.position.copy(surface.center);
    surface.mesh.quaternion.copy(quaternion);
    surface.outline.position.copy(surface.center);
    surface.outline.quaternion.copy(quaternion);
  }

  private createSurface(options: {
    center: Vector3;
    quaternion: Quaternion;
    normal: Vector3;
    width: number;
    height: number;
    thickness: number;
    soft: boolean;
    label: string;
    source: 'plane' | 'virtual' | 'tray';
    visible: boolean;
    color?: number;
  }): SurfaceRecord | null {
    const geometry = new BoxGeometry(
      options.width,
      options.height,
      options.thickness,
    );
    const material = options.visible
      ? new MeshStandardMaterial({
          color: new Color(options.color ?? 0x273244),
          roughness: 0.82,
          metalness: 0.02,
        })
      : new MeshBasicMaterial({
          transparent: true,
          opacity: 0,
          depthWrite: false,
        });
    const mesh = new Mesh(geometry, material);
    mesh.name = `surface-${options.label}`;
    mesh.visible = options.visible;
    const entity = this.world.createTransformEntity(mesh);
    if (entity.object3D == null) {
      return null;
    }
    const center = options.center
      .clone()
      .addScaledVector(options.normal, -options.thickness / 2);
    mesh.position.copy(center);
    mesh.quaternion.copy(options.quaternion);
    entity.addComponent(PhysicsBody, { state: PhysicsState.Static });
    entity.addComponent(PhysicsShape, {
      shape: PhysicsShapeType.Box,
      dimensions: [options.width, options.height, options.thickness],
      density: 1,
      friction: options.soft ? 0.9 : 0.7,
      restitution: options.soft ? 0.04 : 0.25,
    });

    const outlineGeometry = new EdgesGeometry(
      new BoxGeometry(options.width, options.height, options.thickness),
    );
    const outlineMaterial = new LineBasicMaterial({
      color: new Color(0x6fe6ff),
      transparent: true,
      opacity: 0,
      depthWrite: false,
      depthTest: false,
    });
    const outline = new LineSegments(outlineGeometry, outlineMaterial);
    outline.name = `surface-outline-${options.label}`;
    outline.position.copy(center);
    outline.quaternion.copy(options.quaternion);
    outline.visible = false;
    outline.renderOrder = 5;
    const outlineEntity = this.world.createTransformEntity(outline);
    if (outlineEntity.object3D == null) {
      entity.destroy();
      return null;
    }

    const surface: SurfaceRecord = {
      entity,
      mesh,
      outline,
      outlineEntity,
      outlineMaterial,
      center,
      quaternion: options.quaternion.clone(),
      width: options.width,
      height: options.height,
      thickness: options.thickness,
      soft: options.soft,
      label: options.label,
      source: options.source,
      virtual: options.source === 'virtual',
      visibleMesh: options.visible,
    };
    this.surfaces.push(surface);
    if (surface.virtual) {
      this.virtualSurfaces.push(surface);
    }
    return surface;
  }

  private removeSurface(surface: SurfaceRecord): void {
    surface.entity.destroy();
    surface.outlineEntity.destroy();
    const index = this.surfaces.indexOf(surface);
    if (index >= 0) {
      this.surfaces.splice(index, 1);
    }
    const vIndex = this.virtualSurfaces.indexOf(surface);
    if (vIndex >= 0) {
      this.virtualSurfaces.splice(vIndex, 1);
    }
  }

  private removePlaneSurface(planeEntity: Entity): void {
    const surface = this.planeSurfaces.get(planeEntity);
    if (surface == null) {
      return;
    }
    this.planeSurfaces.delete(planeEntity);
    this.removeSurface(surface);
  }

  private clearSurfaces(): void {
    for (const surface of [...this.surfaces]) {
      this.removeSurface(surface);
    }
    this.planeSurfaces.clear();
    this.virtualSurfaces.length = 0;
    this.fallbackGroup = undefined;
  }

  // ---------------------------------------------------------------- fallback

  private updateFallback(delta: number): void {
    if (this.fallbackFading > 0) {
      this.fallbackFading -= delta;
      const opacity = clamp(this.fallbackFading / 0.5, 0, 1);
      for (const surface of this.virtualSurfaces) {
        const material = surface.mesh.material;
        if (material instanceof MeshStandardMaterial) {
          material.transparent = true;
          material.opacity = opacity;
        }
      }
      if (this.fallbackFading <= 0) {
        for (const surface of [...this.virtualSurfaces]) {
          this.removeSurface(surface);
        }
        this.fallbackCreated = false;
        this.fallbackGroup = undefined;
      }
      return;
    }

    if (
      !this.fallbackCreated &&
      this.planeSurfaces.size === 0 &&
      this.noPlaneTime > FALLBACK_DELAY
    ) {
      this.createFallback();
    }
  }

  private beginFallbackFade(): void {
    if (!this.fallbackCreated || this.fallbackFading > 0) {
      return;
    }
    this.fallbackFading = 0.5;
    if (this.messageMesh != null) {
      this.messageMesh.visible = false;
    }
  }

  private createFallback(): void {
    this.fallbackCreated = true;
    const group = new Group();
    group.name = 'virtual-surfaces';
    const groupEntity = this.world.createTransformEntity(group);
    if (groupEntity.object3D != null) {
      this.fallbackGroup = group;
    }

    this.createSurface({
      center: new Vector3(0, 0, 0),
      quaternion: HORIZONTAL_QUAT,
      normal: new Vector3(0, 1, 0),
      width: 4,
      height: 4,
      thickness: 0.04,
      soft: false,
      label: 'floor',
      source: 'virtual',
      visible: true,
      color: 0x17202c,
    });

    // Mattress + pillow, at lap height in front of the player.
    this.createSurface({
      center: new Vector3(0, 0.52, -0.72),
      quaternion: HORIZONTAL_QUAT,
      normal: new Vector3(0, 1, 0),
      width: 1.3,
      height: 0.75,
      thickness: 0.16,
      soft: true,
      label: 'bed',
      source: 'virtual',
      visible: true,
      color: 0x2a3550,
    });
    this.createSurface({
      center: new Vector3(0, 0.64, -0.92),
      quaternion: HORIZONTAL_QUAT,
      normal: new Vector3(0, 1, 0),
      width: 0.48,
      height: 0.3,
      thickness: 0.12,
      soft: true,
      label: 'bed',
      source: 'virtual',
      visible: true,
      color: 0x3b4b70,
    });

    // Bench and shelf.
    this.createSurface({
      center: new Vector3(0.55, 0.46, -0.75),
      quaternion: HORIZONTAL_QUAT,
      normal: new Vector3(0, 1, 0),
      width: 0.95,
      height: 0.5,
      thickness: 0.08,
      soft: false,
      label: 'bench',
      source: 'virtual',
      visible: true,
      color: 0x3a2f52,
    });
    this.createSurface({
      center: new Vector3(-0.65, 0.9, -0.8),
      quaternion: HORIZONTAL_QUAT,
      normal: new Vector3(0, 1, 0),
      width: 0.8,
      height: 0.32,
      thickness: 0.05,
      soft: false,
      label: 'shelf',
      source: 'virtual',
      visible: true,
      color: 0x23364a,
    });

    this.showMessage('No surfaces found, using a virtual desk.');
  }

  // -------------------------------------------------------------------- tray

  private buildTray(): void {
    const surface = this.createSurface({
      center: this.trayCenter.clone(),
      quaternion: HORIZONTAL_QUAT,
      normal: new Vector3(0, 1, 0),
      width: this.traySize.x,
      height: this.traySize.z,
      thickness: this.traySize.y,
      soft: false,
      label: 'toy tray',
      source: 'tray',
      visible: true,
      color: 0x1c2a3a,
    });
    if (surface == null) {
      return;
    }
    this.tray = surface;
  }

  private slotPosition(index: number): Vector3 {
    const cols = 5;
    const x = ((index % cols) - 2) * 0.13;
    const z = (Math.floor(index / cols) % 3 - 1) * 0.13;
    return this.tmpA
      .set(
        this.trayCenter.x + x,
        this.trayCenter.y + this.traySize.y / 2 + 0.02,
        this.trayCenter.z + z,
      )
      .clone();
  }

  private nextSpawnPosition(): Vector3 {
    return this.slotPosition(this.toys.length % 15).add(
      new Vector3(0, 0.25, 0),
    );
  }

  private pullTrayToPlayer(): void {
    const head = this.player.head;
    if (head == null || this.tray == null) {
      return;
    }
    head.updateWorldMatrix(true, false);
    this.tmpA.setFromMatrixPosition(head.matrixWorld);
    this.trayCenter.set(this.tmpA.x, 0.9, this.tmpA.z - 0.55);
    this.tray.center.set(
      this.trayCenter.x,
      this.trayCenter.y - this.traySize.y / 2,
      this.trayCenter.z,
    );
    this.tray.mesh.position.copy(this.tray.center);
    this.tray.outline.position.copy(this.tray.center);
    this.world.getSystem(PhysicsSystem)?.setBodyTransform(this.tray.entity, {
      position: this.tray.center,
      quaternion: HORIZONTAL_QUAT,
    });
    this.resetToys();
  }

  // -------------------------------------------------------------------- toys

  private spawnInitialToys(): void {
    const kinds: ToyKind[] = [
      ToyKinds.RubberBall,
      ToyKinds.RubberBall,
      ToyKinds.HeavyBall,
      ToyKinds.HeavyBall,
      ToyKinds.GlowOrb,
      ToyKinds.GlowOrb,
      ToyKinds.Cube,
      ToyKinds.Cube,
      ToyKinds.Cylinder,
      ToyKinds.Cylinder,
      ToyKinds.Pyramid,
      ToyKinds.Pyramid,
      ToyKinds.Ring,
      ToyKinds.Ring,
    ];
    kinds.forEach((kind, index) => {
      this.spawnToy(kind, this.slotPosition(index));
    });
  }

  private randomKind(): ToyKind {
    const kinds = Object.values(ToyKinds);
    return kinds[this.toyCounter % kinds.length];
  }

  private spawnToy(kind: ToyKind, position: Vector3): ToyRecord | null {
    if (this.toys.length >= MAX_TOYS) {
      const oldest = this.toys.shift();
      if (oldest != null) {
        this.suppressThrowEntity = oldest.entity;
        this.world.getSystem(GrabSystem)?.forceRelease(oldest.entity);
        this.fading.push(oldest);
        oldest.fade = 0.3;
      }
    }

    const spec = this.specFor(kind);
    const { geometry, material, ghostScale } = this.meshFor(kind);
    const mesh = new Mesh(geometry, material);
    mesh.name = `toy-${kind}-${this.toyCounter++}`;
    const entity = this.world.createTransformEntity(mesh);
    if (entity.object3D == null) {
      return null;
    }
    mesh.position.copy(position);
    mesh.position.y += spec.restOffset;
    entity.addComponent(Toy, { kind });
    entity.addComponent(PhysicsBody, {
      state: PhysicsState.Dynamic,
      linearDamping: spec.linearDamping,
      angularDamping: spec.angularDamping,
      gravityFactor: spec.gravityFactor,
    });
    entity.addComponent(PhysicsShape, {
      shape: spec.shape,
      dimensions: spec.dimensions,
      density: spec.density,
      friction: spec.friction,
      restitution: spec.restitution,
    });
    entity.addComponent(OneHandGrabbable, {
      rotate: true,
      translate: true,
    });

    const record: ToyRecord = {
      entity,
      kind,
      mesh,
      material,
      restOffset: spec.restOffset,
      ghostScale,
      spawnedAt: this.toys.length,
      lastSpeed: 0,
      impactCooldown: 0,
      restTime: 0,
      settled: false,
      fade: -1,
    };
    this.toys.push(record);
    this.toyMap.set(entity, record);
    return record;
  }

  private specFor(kind: ToyKind): ToySpec {
    switch (kind) {
      case ToyKinds.RubberBall:
        return newSpec(420, 0.9, 0.45, 0.08, 1, PhysicsShapeType.Sphere, [0.055, 0, 0], 0.055, new Vector3(0.12, 0.12, 0.12));
      case ToyKinds.HeavyBall:
        return newSpec(6000, 0.12, 0.9, 0.28, 1, PhysicsShapeType.Sphere, [0.07, 0, 0], 0.07, new Vector3(0.15, 0.15, 0.15));
      case ToyKinds.GlowOrb:
        return newSpec(35, 0.55, 0.2, 0.55, 0.28, PhysicsShapeType.Sphere, [0.05, 0, 0], 0.05, new Vector3(0.12, 0.12, 0.12));
      case ToyKinds.Cube:
        return newSpec(850, 0.18, 0.8, 0.22, 1, PhysicsShapeType.Box, [0.11, 0.11, 0.11], 0.055, new Vector3(0.12, 0.12, 0.12));
      case ToyKinds.Cylinder:
        return newSpec(900, 0.25, 0.75, 0.2, 1, PhysicsShapeType.Cylinder, [0.055, 0.12, 0], 0.06, new Vector3(0.13, 0.13, 0.13));
      case ToyKinds.Pyramid:
        return newSpec(700, 0.16, 0.85, 0.25, 1, PhysicsShapeType.Box, [0.15, 0.14, 0.15], 0.07, new Vector3(0.17, 0.14, 0.17));
      case ToyKinds.Ring:
      default:
        return newSpec(320, 0.32, 0.65, 0.2, 1, PhysicsShapeType.Cylinder, [0.09, 0.05, 0], 0.025, new Vector3(0.19, 0.06, 0.19));
    }
  }

  private meshFor(kind: ToyKind): {
    geometry: SphereGeometry | BoxGeometry | CylinderGeometry | ConeGeometry | TorusGeometry;
    material: MeshStandardMaterial;
    ghostScale: Vector3;
  } {
    let geometry: SphereGeometry | BoxGeometry | CylinderGeometry | ConeGeometry | TorusGeometry;
    let color = 0x1e2a3b;
    let emissive = 0x000000;
    let emissiveIntensity = 0;
    let roughness = 0.5;
    let metalness = 0.1;
    let ghostScale = new Vector3(0.12, 0.12, 0.12);
    switch (kind) {
      case ToyKinds.RubberBall:
        geometry = new SphereGeometry(0.055, 20, 14);
        color = 0x5fd8f0;
        roughness = 0.38;
        ghostScale = new Vector3(0.11, 0.11, 0.11);
        break;
      case ToyKinds.HeavyBall:
        geometry = new SphereGeometry(0.07, 20, 14);
        color = 0x5c5f6e;
        metalness = 0.35;
        roughness = 0.6;
        ghostScale = new Vector3(0.14, 0.14, 0.14);
        break;
      case ToyKinds.GlowOrb:
        geometry = new SphereGeometry(0.05, 20, 14);
        color = 0x6fe6ff;
        emissive = 0x48d8ff;
        emissiveIntensity = 1.8;
        roughness = 0.25;
        ghostScale = new Vector3(0.1, 0.1, 0.1);
        break;
      case ToyKinds.Cube:
        geometry = new BoxGeometry(0.11, 0.11, 0.11);
        color = 0x4a6fa5;
        roughness = 0.55;
        ghostScale = new Vector3(0.11, 0.11, 0.11);
        break;
      case ToyKinds.Cylinder:
        geometry = new CylinderGeometry(0.055, 0.055, 0.12, 16);
        color = 0x8a63d2;
        emissive = 0x3a1f7a;
        emissiveIntensity = 0.5;
        roughness = 0.45;
        ghostScale = new Vector3(0.11, 0.12, 0.11);
        break;
      case ToyKinds.Pyramid:
        geometry = new ConeGeometry(0.09, 0.14, 4);
        color = 0x6a4bc4;
        emissive = 0x2a165c;
        emissiveIntensity = 0.6;
        roughness = 0.5;
        ghostScale = new Vector3(0.16, 0.14, 0.16);
        break;
      case ToyKinds.Ring:
      default:
        geometry = new TorusGeometry(0.07, 0.022, 8, 24);
        color = 0x49c8e8;
        emissive = 0x1f5d74;
        emissiveIntensity = 0.8;
        roughness = 0.4;
        ghostScale = new Vector3(0.18, 0.06, 0.18);
        break;
    }
    const material = new MeshStandardMaterial({
      color: new Color(color),
      roughness,
      metalness,
      emissive: new Color(emissive),
      emissiveIntensity,
      transparent: true,
      opacity: 1,
    });
    return { geometry, material, ghostScale };
  }

  private updateTrayAndToys(delta: number): void {
    for (const record of this.toys) {
      if (record.impactCooldown > 0) {
        record.impactCooldown -= delta;
      }
      if (record.fade >= 0) {
        record.fade -= delta;
        record.material.opacity = clamp(record.fade / 0.3, 0, 1);
        record.mesh.scale.multiplyScalar(0.97);
        if (record.fade <= 0) {
          this.removeToy(record);
        }
      }
    }
    for (const record of [...this.fading]) {
      record.fade -= delta;
      record.material.opacity = clamp(record.fade / 0.3, 0, 1);
      record.mesh.scale.multiplyScalar(0.97);
      if (record.fade <= 0) {
        this.fading.splice(this.fading.indexOf(record), 1);
        this.removeToy(record);
      }
    }
  }

  private removeToy(record: ToyRecord): void {
    this.toyMap.delete(record.entity);
    const index = this.toys.indexOf(record);
    if (index >= 0) {
      this.toys.splice(index, 1);
    }
    record.entity.destroy();
  }

  private clearToys(): void {
    for (const record of [...this.toys]) {
      record.entity.destroy();
    }
    this.toys.length = 0;
    this.toyMap.clear();
    this.fading.length = 0;
  }

  private resetToys(): void {
    const grab = this.world.getSystem(GrabSystem);
    const physics = this.world.getSystem(PhysicsSystem);
    this.toys.forEach((record, index) => {
      grab?.forceRelease(record.entity);
      record.mesh.scale.set(1, 1, 1);
      record.material.opacity = 1;
      record.settled = false;
      record.restTime = 0;
      const position = this.slotPosition(index);
      position.y += record.restOffset + 0.01;
      if (physics != null) {
        physics.setBodyTransform(record.entity, {
          position,
          quaternion: new Quaternion(),
        });
      } else {
        record.mesh.position.copy(position);
      }
    });
    this.audio.ensure();
  }

  // -------------------------------------------------------------------- grab

  private onGrab(entity: Entity): void {
    const record = this.toyMap.get(entity);
    if (record == null) {
      return;
    }
    this.heldEntity = entity;
    this.heldRecord = record;
    this.heldHand =
      this.world.getSystem(GrabSystem)?.getHolderHand(entity) ?? 'right';
    const grip = this.gripFor(this.heldHand);
    if (grip != null) {
      grip.updateWorldMatrix(true, false);
      this.previousHandPosition.setFromMatrixPosition(grip.matrixWorld);
      this.heldHandPosition.copy(this.previousHandPosition);
    }
    this.audio.ensure();
    this.gentleStart = -1;
  }

  private onRelease(entity: Entity): void {
    if (this.heldEntity !== entity) {
      return;
    }
    const record = this.heldRecord;
    const suppress = this.suppressThrowEntity === entity;
    this.suppressThrowEntity = undefined;
    this.heldEntity = undefined;
    this.heldRecord = undefined;
    this.gentleStart = -1;
    if (record == null || suppress) {
      return;
    }
    record.entity.addComponent(PhysicsManipulation, {
      linearVelocity: [
        clamp(this.heldVelocity.x, -8, 8),
        clamp(this.heldVelocity.y, -8, 8),
        clamp(this.heldVelocity.z, -8, 8),
      ],
    });
  }

  private gripFor(hand: 'left' | 'right'): Object3D | null {
    return hand === 'left'
      ? this.player.gripSpaces.left
      : this.player.gripSpaces.right;
  }

  private updateHeldToy(delta: number): void {
    if (this.heldEntity == null || this.heldRecord == null) {
      return;
    }
    const grip = this.gripFor(this.heldHand);
    if (grip != null) {
      grip.updateWorldMatrix(true, false);
      this.heldHandPosition.setFromMatrixPosition(grip.matrixWorld);
      if (delta > 0) {
        this.heldVelocity
          .copy(this.heldHandPosition)
          .sub(this.previousHandPosition)
          .divideScalar(delta);
        this.previousHandPosition.copy(this.heldHandPosition);
      }
    }
    this.ghostPlacement = this.findPlacement(this.heldRecord.mesh.position);
    const other = this.heldHand === 'left' ? 'right' : 'left';
    const pad =
      other === 'left'
        ? this.input.gamepads.left
        : this.input.gamepads.right;
    if (pad?.getSelectStart() === true) {
      this.gentleStart = this.elapsed;
    }
    if (pad?.getSelectEnd() === true) {
      this.gentleStart = -1;
    }
    if (
      this.gentleStart >= 0 &&
      this.elapsed - this.gentleStart > 0.5 &&
      this.ghostPlacement != null
    ) {
      this.placeGently(this.ghostPlacement);
    }
  }

  private placeGently(placement: {
    position: Vector3;
    quaternion: Quaternion;
    normal: Vector3;
    surface: SurfaceRecord;
  }): void {
    const record = this.heldRecord;
    if (record == null) {
      return;
    }
    this.suppressThrowEntity = record.entity;
    this.world.getSystem(GrabSystem)?.forceRelease(record.entity);
    const position = placement.position
      .clone()
      .addScaledVector(placement.normal, record.restOffset + 0.005);
    const physics = this.world.getSystem(PhysicsSystem);
    physics?.setBodyTransform(record.entity, {
      position,
      quaternion: placement.quaternion,
    });
    record.entity.addComponent(PhysicsManipulation, {
      linearVelocity: [0, 0, 0],
      angularVelocity: [0, 0, 0],
    });
    record.settled = true;
    record.restTime = 999;
    this.ghostPlacement = null;
    this.audio.settle();
  }

  // ------------------------------------------------------------------- ghost

  private buildGhost(): void {
    const root = new Group();
    root.name = 'toy-ghost';
    const rootEntity = this.world.createTransformEntity(root);
    if (rootEntity.object3D == null) {
      return;
    }
    this.ghostRoot = root;
    const ring = new Mesh(
      new RingGeometry(0.065, 0.085, 32),
      new MeshBasicMaterial({
        color: new Color(0x6fe6ff),
        transparent: true,
        opacity: 0.75,
        side: DoubleSide,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = false;
    root.add(ring);
    this.ghostRing = ring;

    const outline = new Mesh(
      new SphereGeometry(1, 12, 8),
      new MeshBasicMaterial({
        color: new Color(0x9fe8ff),
        wireframe: true,
        transparent: true,
        opacity: 0.3,
        depthWrite: false,
      }),
    );
    outline.visible = false;
    root.add(outline);
    this.ghostOutline = outline;
  }

  private updateGhost(): void {
    const placement = this.ghostPlacement;
    if (
      placement == null ||
      this.heldRecord == null ||
      this.ghostRing == null ||
      this.ghostOutline == null
    ) {
      if (this.ghostRing != null) {
        this.ghostRing.visible = false;
      }
      if (this.ghostOutline != null) {
        this.ghostOutline.visible = false;
      }
      return;
    }
    this.ghostRing.visible = true;
    this.ghostRing.position.copy(placement.position);
    this.ghostRing.position.addScaledVector(placement.normal, 0.003);
    this.ghostRing.quaternion.copy(placement.quaternion);

    this.ghostOutline.visible = true;
    this.ghostOutline.position
      .copy(placement.position)
      .addScaledVector(
        placement.normal,
        this.heldRecord.restOffset + 0.01,
      );
    this.ghostOutline.quaternion.copy(placement.quaternion);
    this.ghostOutline.scale.copy(this.heldRecord.ghostScale);
  }

  private findPlacement(position: Vector3): {
    position: Vector3;
    quaternion: Quaternion;
    normal: Vector3;
    surface: SurfaceRecord;
  } | null {
    let best: SurfaceRecord | null = null;
    let bestY = -Infinity;
    let bestNormal = new Vector3();
    let bestTop = new Vector3();
    for (const surface of this.surfaces) {
      const normal = this.tmpA
        .set(0, 0, 1)
        .applyQuaternion(surface.quaternion);
      if (normal.y < 0.5) {
        continue;
      }
      const top = this.tmpB
        .copy(surface.center)
        .addScaledVector(normal, surface.thickness / 2);
      if (top.y > position.y + 0.02 || top.y <= bestY) {
        continue;
      }
      this.tmpQInv.copy(surface.quaternion).invert();
      this.tmpC.copy(position).sub(top).applyQuaternion(this.tmpQInv);
      if (
        Math.abs(this.tmpC.x) <= surface.width / 2 + 0.05 &&
        Math.abs(this.tmpC.y) <= surface.height / 2 + 0.05
      ) {
        best = surface;
        bestY = top.y;
        bestNormal.copy(normal);
        bestTop.copy(top);
      }
    }
    if (best == null) {
      return null;
    }
    return {
      position: bestTop.clone(),
      quaternion: best.quaternion.clone(),
      normal: bestNormal,
      surface: best,
    };
  }

  // ---------------------------------------------------------------- feedback

  private updateImpacts(delta: number): void {
    for (const record of this.toys) {
      if (this.heldEntity === record.entity || record.fade >= 0) {
        continue;
      }
      const velocity = record.entity.getVectorView(
        PhysicsBody,
        '_linearVelocity',
      );
      const speed = Math.hypot(velocity[0], velocity[1], velocity[2]);
      if (
        record.lastSpeed > 0.8 &&
        speed < record.lastSpeed * 0.55 &&
        record.impactCooldown <= 0
      ) {
        const surface = this.findPlacement(record.mesh.position)?.surface;
        const soft = surface?.soft ?? false;
        this.audio.impact(record.lastSpeed, soft);
        record.impactCooldown = 0.15;
        if (record.lastSpeed > 1.8) {
          this.pulse(record.mesh.position, soft);
        }
      }
      if (speed < 0.09) {
        record.restTime += delta;
        if (!record.settled && record.restTime > 0.5) {
          const surface = this.findPlacement(record.mesh.position)?.surface;
          if (surface?.soft) {
            this.audio.settle();
          }
          record.settled = true;
        }
      } else {
        record.restTime = 0;
        if (speed > 0.2) {
          record.settled = false;
        }
      }
      record.lastSpeed = speed;
    }
  }

  private pulse(position: Vector3, soft: boolean): void {
    if (this.impactPulse == null) {
      const pulse = new Mesh(
        new RingGeometry(0.04, 0.06, 24),
        new MeshBasicMaterial({
          color: new Color(soft ? 0x8fb8ff : 0x6fe6ff),
          transparent: true,
          opacity: 0,
          side: DoubleSide,
          depthWrite: false,
          blending: AdditiveBlending,
        }),
      );
      pulse.rotation.x = -Math.PI / 2;
      const e = this.world.createTransformEntity(pulse);
      if (e.object3D == null) {
        return;
      }
      this.impactPulse = pulse;
    }
    this.impactPulse.position.copy(position);
    this.impactPulseLife = 0.25;
    this.impactPulse.visible = true;
  }

  private updatePulse(delta: number): void {
    if (this.impactPulse == null || this.impactPulseLife <= 0) {
      return;
    }
    this.impactPulseLife -= delta;
    const material = this.impactPulse.material as MeshBasicMaterial;
    material.opacity = clamp(this.impactPulseLife / 0.25, 0, 1) * 0.8;
    const scale = 1 + (1 - this.impactPulseLife / 0.25) * 4;
    this.impactPulse.scale.setScalar(scale);
    if (this.impactPulseLife <= 0) {
      this.impactPulse.visible = false;
    }
  }

  // ---------------------------------------------------------------- outlines

  private updateCloudOutlines(delta: number): void {
    this.updatePulse(delta);
    const dial = this.queries.dial.entities.values().next().value;
    const value = dial?.getValue(RealityDial, 'value') ?? 0;
    const intensity = smoothstep(0.35, 0.95, value) * 0.6;
    for (const surface of this.surfaces) {
      if (intensity <= 0.001) {
        surface.outline.visible = false;
        continue;
      }
      let holdsToy = false;
      for (const record of this.toys) {
        this.tmpC
          .copy(record.mesh.position)
          .sub(surface.center)
          .applyQuaternion(this.tmpQInv.copy(surface.quaternion).invert());
        if (
          Math.abs(this.tmpC.x) <= surface.width / 2 + 0.2 &&
          Math.abs(this.tmpC.y) <= surface.height / 2 + 0.2 &&
          Math.abs(this.tmpC.z) <= surface.thickness / 2 + 0.35
        ) {
          holdsToy = true;
          break;
        }
      }
      surface.outline.visible = holdsToy;
      surface.outlineMaterial.opacity = holdsToy ? intensity : 0;
    }
  }

  // ----------------------------------------------------------------- gesture

  private updateGestures(delta: number): void {
    const left = this.input.gamepads.left;
    const right = this.input.gamepads.right;
    if (left?.getSelectStart() === true) {
      if (this.elapsed - this.lastLeftPinch < 0.45 && this.heldEntity == null) {
        this.pullTrayToPlayer();
      }
      this.lastLeftPinch = this.elapsed;
      this.leftPinching = true;
    }
    if (left?.getSelectEnd() === true) {
      this.leftPinching = false;
    }
    if (right?.getSelectStart() === true) {
      this.rightPinching = true;
    }
    if (right?.getSelectEnd() === true) {
      this.rightPinching = false;
    }
    if (this.leftPinching && this.rightPinching) {
      this.bothPinchTime += delta;
      if (this.bothPinchTime > 0.8) {
        this.bothPinchTime = 0;
        this.resetToys();
      }
    } else {
      this.bothPinchTime = 0;
    }
  }

  // ----------------------------------------------------------------- message

  private buildMessage(): void {
    const canvas = document.createElement('canvas');
    canvas.width = 640;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx == null) {
      return;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.font = '600 34px system-ui, sans-serif';
    ctx.fillStyle = 'rgba(225, 245, 255, 0.95)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('No surfaces found, using a virtual desk.', 320, 64);
    const texture = new CanvasTexture(canvas);
    texture.colorSpace = SRGBColorSpace;
    this.messageTexture = texture;
    const material = new MeshBasicMaterial({
      map: texture,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: DoubleSide,
    });
    const mesh = new Mesh(new PlaneGeometry(0.9, 0.18), material);
    mesh.name = 'surface-message';
    const entity = this.world.createTransformEntity(mesh);
    if (entity.object3D == null) {
      return;
    }
    this.messageMesh = mesh;
    mesh.visible = false;
  }

  private showMessage(text: string): void {
    if (this.messageMesh == null) {
      return;
    }
    this.messageMesh.visible = true;
    this.messageTime = 0;
    this.messageShown = true;
    void text;
  }

  private updateMessage(delta: number): void {
    if (this.messageMesh == null || !this.messageShown) {
      return;
    }
    this.messageTime += delta;
    const head = this.player.head;
    if (head != null) {
      head.updateWorldMatrix(true, false);
      this.tmpA.setFromMatrixPosition(head.matrixWorld);
      this.messageMesh.position.set(
        this.tmpA.x,
        1.45,
        this.tmpA.z - 0.85,
      );
      this.world.camera.updateWorldMatrix(true, false);
      this.world.camera.getWorldQuaternion(this.tmpQ);
      this.messageMesh.quaternion.copy(this.tmpQ);
    }
    const material = this.messageMesh.material as MeshBasicMaterial;
    const fade = this.messageTime < 3.5 ? 1 : clamp(1 - (this.messageTime - 3.5) / 1.5, 0, 1);
    material.opacity = fade * 0.9;
    if (fade <= 0) {
      this.messageMesh.visible = false;
      this.messageShown = false;
    }
  }

  private logPlanes(delta: number): void {
    this.logTimer += delta;
    if (this.logTimer < LOG_INTERVAL) {
      return;
    }
    this.logTimer = 0;
    const parts = [...this.planeSurfaces.values()]
      .map(
        (s) =>
          `${s.label}:${s.width.toFixed(2)}x${s.height.toFixed(2)}${s.soft ? ':soft' : ''}`,
      )
      .sort();
    const signature = `${parts.length}|${parts.join(',')}`;
    if (signature !== this.lastPlaneSignature) {
      this.lastPlaneSignature = signature;
      console.info(
        `[Toys] surfaces=${parts.length} ${parts.join(' | ') || 'none (virtual fallback)'}`,
      );
    }
  }
}
