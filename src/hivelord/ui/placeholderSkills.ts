import { hivelordEvents } from '../core/EventBus.js';

export interface PlaceholderSkill {
  id: string;
  name: string;
  gestureHint: string;
  unlocked: boolean;
}

/**
 * Placeholder skill table for Level 3. Level 15 owns real unlock state;
 * unlockSkill() emits SkillUnlocked so later levels can plug in.
 */
const skills: PlaceholderSkill[] = [
  { id: 'the-call', name: 'The Call', gestureHint: 'Pinch', unlocked: true },
  { id: 'gather', name: 'Gather', gestureHint: 'Fist', unlocked: false },
  {
    id: 'wall-crawl',
    name: 'Wall Crawl',
    gestureHint: 'Flat palm',
    unlocked: false,
  },
  { id: 'scout', name: 'Scout', gestureHint: 'Cupped palm', unlocked: false },
  { id: 'shield', name: 'Shield', gestureHint: 'Two-palm stop', unlocked: false },
  {
    id: 'giant-hand',
    name: 'Giant Hand',
    gestureHint: 'Open palm',
    unlocked: false,
  },
];

export function getPlaceholderSkills(): PlaceholderSkill[] {
  return skills;
}

export function unlockSkill(id: string): boolean {
  const skill = skills.find((entry) => entry.id === id);
  if (skill == null || skill.unlocked) {
    return false;
  }
  skill.unlocked = true;
  hivelordEvents.emit('SkillUnlocked', { skillId: id });
  return true;
}

export function resetPlaceholderSkills(): void {
  for (const skill of skills) {
    skill.unlocked = skill.id === 'the-call';
  }
}
