import { THEME, withAlpha } from '../theme.js';
import {
  drawAbilityGlyph,
  drawHex,
  drawLock,
  type AbilityGlyph,
} from './icons.js';
import { roundRectPath } from './panel.js';

export interface CardSkill {
  id: string;
  name: string;
  gestureHint: string;
  unlocked: boolean;
  glyph: AbilityGlyph;
  lockedText: string;
}

/** One ability card: hex medallion, name, gesture hint, locked styling. */
export function drawAbilityCard(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  skill: CardSkill,
  flash: number,
): void {
  ctx.fillStyle = withAlpha(THEME.panelRaised, 0.45);
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.fill();
  ctx.strokeStyle = skill.unlocked
    ? withAlpha(THEME.primary, 0.5)
    : THEME.panelEdge;
  ctx.lineWidth = skill.unlocked ? 2 : 1;
  roundRectPath(ctx, x, y, w, h, 14);
  ctx.stroke();
  if (skill.unlocked) {
    ctx.save();
    ctx.shadowColor = withAlpha(THEME.primary, 0.18);
    ctx.shadowBlur = 12;
    roundRectPath(ctx, x, y, w, h, 14);
    ctx.stroke();
    ctx.restore();
  }

  const cx = x + 52;
  const cy = y + 52;
  const medallion = skill.unlocked ? THEME.primary : THEME.locked;
  drawHex(ctx, cx, cy, 36, medallion, withAlpha(THEME.base, 0.45), 2);
  if (skill.unlocked) {
    drawAbilityGlyph(ctx, skill.glyph, cx, cy, 42, THEME.primary);
  } else {
    drawLock(ctx, cx, cy, 34, THEME.textFaint);
  }

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = skill.unlocked ? THEME.text : THEME.textMuted;
  ctx.font = `600 ${THEME.bodyPx}px ${THEME.fontFamily}`;
  ctx.fillText(skill.name, x + 104, y + 40);

  ctx.fillStyle = skill.unlocked ? THEME.textMuted : THEME.textFaint;
  ctx.font = `500 ${THEME.smallPx}px ${THEME.fontFamily}`;
  ctx.fillText(
    skill.unlocked ? skill.gestureHint : skill.lockedText,
    x + 104,
    y + 74,
    w - 120,
  );

  if (flash > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, flash);
    const sweep = ctx.createLinearGradient(x, y, x + w, y + h);
    sweep.addColorStop(0, withAlpha(THEME.accent, 0.2));
    sweep.addColorStop(0.5, withAlpha(THEME.primary, 0.28));
    sweep.addColorStop(1, withAlpha(THEME.accent, 0.12));
    ctx.fillStyle = sweep;
    roundRectPath(ctx, x, y, w, h, 14);
    ctx.fill();
    ctx.strokeStyle = withAlpha(THEME.primary, 0.7);
    ctx.lineWidth = 2;
    roundRectPath(ctx, x, y, w, h, 14);
    ctx.stroke();
    ctx.restore();
  }
}
