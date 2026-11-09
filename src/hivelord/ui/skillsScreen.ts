import type { World } from '@iwsdk/core';
import { CanvasPanel, UIScreen } from './screen.js';
import { drawControl, makeControl, type Control } from './controls.js';
import { drawPanel, drawTitle } from './draw/panel.js';
import { drawAbilityCard, type CardSkill } from './draw/cards.js';
import type { AbilityGlyph } from './draw/icons.js';
import { getPlaceholderSkills } from './placeholderSkills.js';
import { hivelordEvents } from '../core/EventBus.js';
import { STRINGS } from './strings.js';
import { THEME } from './theme.js';

const GLYPHS: Record<string, AbilityGlyph> = {
  'the-call': 'pinch',
  gather: 'fist',
  'wall-crawl': 'wall',
  scout: 'scout',
  shield: 'shield',
  'giant-hand': 'grab',
};

/** Skills as a 2x3 grid of ability cards with locked/unlocked treatment. */
export class SkillsScreen extends UIScreen {
  readonly id = 'skills' as const;
  controls: Control[] = [];
  private readonly flash = new Map<string, number>();

  build(world: World): void {
    this.panel = new CanvasPanel(world, 'hivelord-ui-skills', 0.56, 0.62);
    this.controls = [
      makeControl('back', 'button', 48, this.panel.heightPx - 76, this.panel.widthPx - 96, 56, STRINGS.skillsBack),
    ];
    hivelordEvents.on('SkillUnlocked', ({ skillId }) => {
      this.flash.set(skillId, 1);
      this.panel?.setDirty();
    });
  }

  onShow(): void {
    this.panel?.setDirty();
  }

  update(dt: number): void {
    let dirty = false;
    for (const [id, value] of this.flash) {
      const next = Math.max(0, value - dt / 0.6);
      if (next === 0) {
        this.flash.delete(id);
      } else {
        this.flash.set(id, next);
      }
      dirty = true;
    }
    if (dirty) {
      this.panel?.setDirty();
    }
  }

  draw(ctx: CanvasRenderingContext2D): void {
    const panel = this.panel;
    if (panel == null) {
      return;
    }
    drawPanel(ctx, panel.widthPx, panel.heightPx);
    drawTitle(
      ctx,
      panel.widthPx,
      STRINGS.skillsTitle,
      false,
      46,
      'hex',
      'Six memories of the swarm.',
      THEME.primary,
      40,
    );
    const margin = 40;
    const gap = 14;
    const top = 130;
    const bottom = panel.heightPx - 96;
    const cards = getPlaceholderSkills();
    const cardW = (panel.widthPx - margin * 2 - gap) / 2;
    const cardH = (bottom - top - gap * 2) / 3;
    for (let i = 0; i < cards.length; i++) {
      const skill = cards[i];
      if (skill == null) {
        continue;
      }
      const col = i % 2;
      const row = Math.floor(i / 2);
      const card: CardSkill = {
        id: skill.id,
        name: skill.name,
        gestureHint: skill.gestureHint,
        unlocked: skill.unlocked,
        glyph: GLYPHS[skill.id] ?? 'pinch',
        lockedText: STRINGS.skillsLocked,
      };
      drawAbilityCard(
        ctx,
        margin + col * (cardW + gap),
        top + row * (cardH + gap),
        cardW,
        cardH,
        card,
        this.flash.get(skill.id) ?? 0,
      );
    }
    for (const c of this.controls) {
      drawControl(ctx, c);
    }
  }

  onControl(_controlId: string): void {}

  hitControlAt(): Control | null {
    return null;
  }
}
