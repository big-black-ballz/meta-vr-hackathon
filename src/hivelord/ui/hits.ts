import {
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  Quaternion,
  RayInteractable,
  Vector3,
} from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { UIHit } from './UIHitComponent.js';
import { UI_PPM } from './screen.js';
import type { Control } from './controls.js';
import { THEME } from './theme.js';
import { uiSounds } from './sounds.js';

export interface HitRecord {
  mesh: Mesh;
  control: Control;
  screenId: string;
  localX: number;
  localY: number;
  cooldownUntil: number;
  dwell: number;
  armed: boolean;
  visible: boolean;
}

const tmpV = new Vector3();
const tmpQ = new Quaternion();

/**
 * One invisible-but-raycastable hit mesh per actionable control. Meshes stay
 * scene-rooted (their entities own the transform) and are re-seated onto the
 * panel by layoutHitMeshes() whenever the panel moves. Uses only proven SDK
 * patterns: RayInteractable + Pressed queries (RobotSystem) and
 * pointerenter/leave listeners (SceneShowSystem). Hit area is padded beyond
 * the visual on each side.
 */
export function buildHitMeshes(
  world: World,
  screenId: string,
  panelWpx: number,
  panelHpx: number,
  controls: Control[],
  onHover: (control: Control, hover: boolean) => void,
): HitRecord[] {
  const records: HitRecord[] = [];
  const material = new MeshBasicMaterial({
    transparent: true,
    opacity: 0,
    depthWrite: false,
    visible: false,
  });
  for (const control of controls) {
    if (
      control.kind !== 'button' &&
      control.kind !== 'toggle' &&
      control.kind !== 'hit' &&
      control.kind !== 'tab'
    ) {
      continue;
    }
    const wM = (control.w + THEME.hitPadPx * 2) / UI_PPM;
    const hM = (control.h + THEME.hitPadPx * 2) / UI_PPM;
    const mesh = new Mesh(new PlaneGeometry(wM, hM), material);
    mesh.name = `ui-hit-${screenId}-${control.id}`;
    mesh.visible = false;
    const entity = world.createTransformEntity(mesh);
    entity.addComponent(UIHit);
    entity.setValue(UIHit, 'screen', screenId);
    entity.setValue(UIHit, 'control', control.id);
    entity.addComponent(RayInteractable);
    mesh.addEventListener('pointerenter', () => {
      if (!control.enabled) {
        return;
      }
      control.hover = true;
      onHover(control, true);
      uiSounds.hover();
    });
    mesh.addEventListener('pointerleave', () => {
      control.hover = false;
      control.pressed = false;
      onHover(control, false);
    });
    mesh.addEventListener('pointerdown', () => {
      if (!control.enabled) {
        return;
      }
      control.pressed = true;
    });
    mesh.addEventListener('pointerup', () => {
      control.pressed = false;
    });
    records.push({
      mesh,
      control,
      screenId,
      localX: (control.x + control.w / 2 - panelWpx / 2) / UI_PPM,
      localY: (panelHpx / 2 - (control.y + control.h / 2)) / UI_PPM,
      cooldownUntil: 0,
      dwell: 0,
      armed: true,
      visible: false,
    });
  }
  return records;
}

/** Seats hit meshes onto their panel. Call after every panel placement. */
export function layoutHitMeshes(
  records: HitRecord[],
  panel: Mesh,
  visible: boolean,
): void {
  panel.updateWorldMatrix(true, false);
  for (const record of records) {
    const active = visible && !record.control.hidden;
    record.visible = active;
    record.mesh.visible = active;
    if (!active) {
      continue;
    }
    tmpV.set(record.localX, record.localY, 0.004).applyMatrix4(panel.matrixWorld);
    record.mesh.position.copy(tmpV);
    panel.getWorldQuaternion(tmpQ);
    record.mesh.quaternion.copy(tmpQ);
  }
}
