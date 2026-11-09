import { Quaternion, Vector3 } from '@iwsdk/core';
import type { World } from '@iwsdk/core';
import { hivelordEvents } from '../core/EventBus.js';
import type { GestureDetector } from '../input/GestureDetector.js';
import { CanvasPanel } from './screen.js';
import { drawRadial } from './controls.js';
import { STRINGS } from './strings.js';
import { THEME } from './theme.js';
import { settings } from './settings.js';
import { getPlaceholderSkills } from './placeholderSkills.js';

const HUD_HZ = 10;
const TOAST_SECONDS = 3;
const BANNER_W_M = 0.46;
const BANNER_H_M = 0.1;

interface ToastItem {
  text: string;
  kind: 'info' | 'success' | 'warning';
  timeLeft: number;
}

interface SubtitleItem {
  speaker: string;
  text: string;
  timeLeft: number;
}

const tmpA = new Vector3();
const tmpB = new Vector3();
const tmpC = new Vector3();
const tmpQ = new Quaternion();

function subtitleDuration(text: string): number {
  return Math.min(8, 2 + text.length * 0.06);
}

/**
 * Non-blocking HUD and feedback widgets: ability bar at the dominant wrist,
 * fingertip charge ring, placeholder stun meter, objective hint, toast queue,
 * subtitle queue and the tracking-lost banner. All driven by events and
 * placeholder/test hooks; no gameplay logic.
 */
export class HUD {
  private world: World | null = null;
  private ability: CanvasPanel | null = null;
  private objective: CanvasPanel | null = null;
  private toasts: CanvasPanel | null = null;
  private subtitles: CanvasPanel | null = null;
  private banner: CanvasPanel | null = null;
  private charge: CanvasPanel | null = null;
  private stun: CanvasPanel | null = null;

  private cooldownLeft: number[] = [0, 0, 0, 0, 0, 0];
  private cooldownTotal: number[] = [8, 8, 8, 8, 8, 8];
  private objectiveText: string = STRINGS.objectiveDefault;
  private toastQueue: ToastItem[] = [];
  private subtitleQueue: SubtitleItem[] = [];
  private subtitleActive: SubtitleItem | null = null;
  private bannerVisible = false;
  private chargeProgress = 0;
  private stunProgress = 0;
  private stunVisible = false;
  private accum = 0;
  private followYaw = 0;
  private followInit = false;
  private subtitleSizePx: number = THEME.bodyPx;

  build(world: World): void {
    this.world = world;
    this.ability = new CanvasPanel(world, 'hivelord-hud-abilities', 0.34, 0.11);
    this.objective = new CanvasPanel(world, 'hivelord-hud-objective', 0.42, 0.07);
    this.toasts = new CanvasPanel(world, 'hivelord-hud-toasts', 0.42, 0.15);
    this.subtitles = new CanvasPanel(world, 'hivelord-hud-subtitles', 0.62, 0.15);
    this.banner = new CanvasPanel(world, 'hivelord-hud-banner', BANNER_W_M, BANNER_H_M);
    this.charge = new CanvasPanel(world, 'hivelord-hud-charge', 0.1, 0.1);
    this.stun = new CanvasPanel(world, 'hivelord-hud-stun', 0.18, 0.05);

    hivelordEvents.on('AbilityUsed', ({ ability }) => {
      const list = getPlaceholderSkills();
      const index = list.findIndex((entry) => entry.id === ability);
      if (index >= 0) {
        this.cooldownLeft[index] = this.cooldownTotal[index] ?? 8;
        this.ability?.setDirty();
      }
    });
    hivelordEvents.on('ObjectiveChanged', ({ text }) => {
      this.objectiveText = text;
      this.objective?.setDirty();
    });
    hivelordEvents.on('ToastRequested', ({ text, kind }) => {
      this.toastQueue.push({ text, kind, timeLeft: TOAST_SECONDS });
      while (this.toastQueue.length > 3) {
        this.toastQueue.shift();
      }
      this.toasts?.setDirty();
    });
    hivelordEvents.on('SubtitleRequested', ({ speaker, text, durationSeconds }) => {
      if (!settings.get('subtitlesOn')) {
        return;
      }
      this.subtitleQueue.push({
        speaker,
        text,
        timeLeft: durationSeconds ?? subtitleDuration(text),
      });
    });
  }

  /** Placeholder/test hooks for dev shortcuts and later levels. */
  testCooldowns(seconds: number): void {
    for (let i = 0; i < this.cooldownLeft.length; i++) {
      this.cooldownLeft[i] = seconds;
      this.cooldownTotal[i] = Math.max(1, seconds);
    }
    this.ability?.setDirty();
  }

  setCharge(p: number): void {
    this.chargeProgress = Math.max(0, Math.min(1, p));
    this.charge?.setDirty();
  }

  setStun(p: number, visible: boolean): void {
    this.stunProgress = Math.max(0, Math.min(1, p));
    this.stunVisible = visible;
    this.stun?.setDirty();
  }

  setBannerVisible(visible: boolean): void {
    if (this.bannerVisible === visible) {
      return;
    }
    this.bannerVisible = visible;
    this.banner?.setDirty();
  }

  update(
    dt: number,
    headPos: Vector3,
    headQuat: Quaternion,
    detector: GestureDetector | null,
    inGame: boolean,
  ): void {
    if (!inGame) {
      this.ability?.setVisible(false);
      this.objective?.setVisible(false);
      this.toasts?.setVisible(false);
      this.charge?.setVisible(false);
      this.stun?.setVisible(false);
      this.banner?.setVisible(false);
      return;
    }
    const showHud = settings.get('hudVisible');
    for (let i = 0; i < this.cooldownLeft.length; i++) {
      if (this.cooldownLeft[i] > 0) {
        this.cooldownLeft[i] = Math.max(0, this.cooldownLeft[i] - dt);
        this.ability?.setDirty();
      }
    }

    let toastDirty = false;
    for (const toast of this.toastQueue) {
      toast.timeLeft -= dt;
      toastDirty = true;
    }
    while (this.toastQueue.length > 0 && (this.toastQueue[0]?.timeLeft ?? 1) <= 0) {
      this.toastQueue.shift();
      toastDirty = true;
    }
    if (toastDirty) {
      this.toasts?.setDirty();
    }

    if (this.subtitleActive != null) {
      this.subtitleActive.timeLeft -= dt;
      if (this.subtitleActive.timeLeft <= 0) {
        this.subtitleActive = null;
        this.subtitles?.setDirty();
      }
    }
    if (this.subtitleActive == null && this.subtitleQueue.length > 0) {
      this.subtitleActive = this.subtitleQueue.shift() ?? null;
      this.subtitles?.setDirty();
    }

    this.accum += dt;
    const tick = this.accum >= 1 / HUD_HZ;
    if (tick) {
      this.accum = 0;
    }

    this.placeFollowWidgets(headPos, headQuat);
    this.placeWristWidgets(headPos, headQuat, detector, showHud);
    this.renderAll(showHud, tick);
  }

  private faceHead(mesh: { position: Vector3; quaternion: Quaternion }, headPos: Vector3): void {
    tmpA.copy(headPos).sub(mesh.position).normalize();
    tmpB.set(0, 0, 1);
    mesh.quaternion.setFromUnitVectors(tmpB, tmpA);
  }

  /** Smooth-follow widgets lag head yaw; snap when turning past ~60 deg. */
  private followPose(
    headPos: Vector3,
    headQuat: Quaternion,
    distance: number,
    heightOffset: number,
    out: Vector3,
  ): void {
    tmpA.set(0, 0, -1).applyQuaternion(headQuat);
    const targetYaw = Math.atan2(-tmpA.x, -tmpA.z);
    if (!this.followInit) {
      this.followYaw = targetYaw;
      this.followInit = true;
    }
    let diff = targetYaw - this.followYaw;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    if (Math.abs(diff) > (60 * Math.PI) / 180) {
      this.followYaw = targetYaw;
    } else {
      this.followYaw += diff * 0.12;
    }
    const x = -Math.sin(this.followYaw);
    const z = -Math.cos(this.followYaw);
    out.set(headPos.x + x * distance, headPos.y + heightOffset, headPos.z + z * distance);
  }

  private placeFollowWidgets(headPos: Vector3, headQuat: Quaternion): void {
    if (this.subtitles != null) {
      const visible = this.subtitleActive != null;
      this.subtitles.setVisible(visible);
      if (visible) {
        this.followPose(headPos, headQuat, 1.2, -0.32, this.subtitles.mesh.position);
        this.faceHead(this.subtitles.mesh, headPos);
      }
    }
    if (this.toasts != null) {
      const visible = this.toastQueue.length > 0;
      this.toasts.setVisible(visible);
      if (visible) {
        this.followPose(headPos, headQuat, 1.2, -0.18, this.toasts.mesh.position);
        this.faceHead(this.toasts.mesh, headPos);
      }
    }
    if (this.objective != null) {
      this.objective.setVisible(true);
      this.followPose(headPos, headQuat, 1.5, 0.34, this.objective.mesh.position);
      this.faceHead(this.objective.mesh, headPos);
    }
    if (this.banner != null) {
      this.banner.setVisible(this.bannerVisible);
      if (this.bannerVisible) {
        this.followPose(headPos, headQuat, 0.9, 0.05, this.banner.mesh.position);
        this.faceHead(this.banner.mesh, headPos);
      }
    }
    if (this.stun != null) {
      this.stun.setVisible(this.stunVisible);
      if (this.stunVisible) {
        tmpC.set(0, 0, -1).applyQuaternion(headQuat);
        tmpC.y = 0;
        if (tmpC.lengthSq() < 1e-6) {
          tmpC.set(0, 0, -1);
        }
        tmpC.normalize();
        this.stun.mesh.position
          .copy(headPos)
          .addScaledVector(tmpC, 1.1)
          .addScaledVector(tmpA.set(0, 1, 0), 0.15);
        this.faceHead(this.stun.mesh, headPos);
      }
    }
  }

  private placeWristWidgets(
    headPos: Vector3,
    _headQuat: Quaternion,
    detector: GestureDetector | null,
    showHud: boolean,
  ): void {
    const dominant = detector?.getDominantHand() ?? 'right';
    const hand = dominant === 'left' ? detector?.left : detector?.right;
    const tracked = hand?.tracked === true;
    if (this.ability != null) {
      const visible = showHud && tracked;
      this.ability.setVisible(visible);
      if (visible && hand != null) {
        this.ability.mesh.position.copy(hand.palmCenter).addScaledVector(tmpA.set(0, 1, 0), 0.09);
        this.faceHead(this.ability.mesh, headPos);
      }
    }
    if (this.charge != null) {
      const visible = showHud && tracked && this.chargeProgress > 0;
      this.charge.setVisible(visible);
      if (visible && hand != null) {
        hand.copyFingertip(tmpC);
        this.charge.mesh.position.copy(tmpC);
        this.faceHead(this.charge.mesh, headPos);
      }
    }
    void _headQuat;
  }

  private renderAll(showHud: boolean, tick: boolean): void {
    this.ability?.render((ctx) => this.drawAbilityBar(ctx, showHud));
    this.objective?.render((ctx) => {
      const c = this.objective;
      if (c == null) {
        return;
      }
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(8, 15, 26, 0.75)';
      ctx.fillRect(0, 0, c.widthPx, c.heightPx);
      ctx.fillStyle = THEME.accent;
      ctx.font = `600 ${THEME.smallPx}px ${THEME.fontFamily}`;
      ctx.fillText(this.objectiveText, 18, c.heightPx / 2, c.widthPx - 36);
    });
    this.toasts?.render((ctx) => {
      const c = this.toasts;
      if (c == null) {
        return;
      }
      const items = this.toastQueue.slice(-2);
      let y = 10;
      for (const item of items) {
        ctx.fillStyle =
          item.kind === 'warning'
            ? 'rgba(60, 35, 10, 0.9)'
            : item.kind === 'success'
              ? 'rgba(10, 50, 30, 0.9)'
              : 'rgba(8, 15, 26, 0.9)';
        ctx.fillRect(10, y, c.widthPx - 20, 62);
        ctx.fillStyle =
          item.kind === 'warning' ? THEME.warning : THEME.text;
        ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(item.text, 24, y + 31, c.widthPx - 48);
        y += 70;
      }
    });
    void tick;
    this.subtitles?.render((ctx) => this.drawSubtitles(ctx));
    this.banner?.render((ctx) => {
      const c = this.banner;
      if (c == null) {
        return;
      }
      ctx.fillStyle = 'rgba(60, 30, 8, 0.92)';
      ctx.fillRect(0, 0, c.widthPx, c.heightPx);
      ctx.strokeStyle = THEME.warning;
      ctx.lineWidth = 3;
      ctx.strokeRect(3, 3, c.widthPx - 6, c.heightPx - 6);
      ctx.fillStyle = THEME.warning;
      ctx.font = `600 ${THEME.buttonPx}px ${THEME.fontFamily}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(STRINGS.trackingBanner, c.widthPx / 2, c.heightPx / 2);
    });
    this.charge?.render((ctx) => {
      const c = this.charge;
      if (c == null) {
        return;
      }
      drawRadial(
        ctx,
        c.widthPx / 2,
        c.heightPx / 2,
        c.widthPx / 2 - 12,
        this.chargeProgress,
        this.chargeProgress >= 1,
      );
    });
    this.stun?.render((ctx) => {
      const c = this.stun;
      if (c == null) {
        return;
      }
      ctx.fillStyle = 'rgba(8, 15, 26, 0.85)';
      ctx.fillRect(0, 0, c.widthPx, c.heightPx);
      ctx.fillStyle = THEME.danger;
      const w = c.widthPx * Math.max(0, Math.min(1, this.stunProgress));
      ctx.fillRect(0, 0, w, c.heightPx);
    });
  }

  private drawAbilityBar(ctx: CanvasRenderingContext2D, showHud: boolean): void {
    const c = this.ability;
    if (c == null) {
      return;
    }
    void showHud;
    ctx.fillStyle = 'rgba(8, 15, 26, 0.8)';
    ctx.fillRect(0, 0, c.widthPx, c.heightPx);
    const list = getPlaceholderSkills();
    const slot = c.widthPx / 6;
    for (let i = 0; i < 6; i++) {
      const skill = list[i];
      const cx = slot * (i + 0.5);
      const cy = c.heightPx / 2;
      const total = this.cooldownTotal[i] ?? 8;
      const left = this.cooldownLeft[i] ?? 0;
      const ready = left <= 0;
      if (skill != null && !skill.unlocked) {
        ctx.fillStyle = THEME.disabled;
        ctx.font = `600 ${THEME.tinyPx}px ${THEME.fontFamily}`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('X', cx, cy);
        continue;
      }
      drawRadial(ctx, cx, cy, 34, total > 0 ? 1 - left / total : 1, ready);
    }
  }

  private drawSubtitles(ctx: CanvasRenderingContext2D): void {
    const c = this.subtitles;
    const active = this.subtitleActive;
    if (c == null || active == null) {
      return;
    }
    const size =
      settings.get('subtitleSize') === 'S'
        ? THEME.smallPx
        : settings.get('subtitleSize') === 'L'
          ? THEME.titlePx
          : THEME.bodyPx;
    this.subtitleSizePx = size;
    const bg = settings.get('subtitleBg');
    if (bg === 'solid') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.9)';
      ctx.fillRect(0, 0, c.widthPx, c.heightPx);
    } else if (bg === 'light') {
      ctx.fillStyle = 'rgba(8, 15, 26, 0.75)';
      ctx.fillRect(0, 0, c.widthPx, c.heightPx);
    }
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = THEME.accent;
    ctx.font = `700 ${THEME.smallPx}px ${THEME.fontFamily}`;
    ctx.fillText(active.speaker, 24, 30);
    ctx.fillStyle = THEME.text;
    ctx.font = `500 ${size}px ${THEME.fontFamily}`;
    ctx.fillText(active.text, 24, 30 + size, c.widthPx - 48);
    void this.subtitleSizePx;
  }
}
