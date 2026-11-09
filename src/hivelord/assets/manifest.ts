/**
 * Typed Hivelord asset catalog. URLs are app-relative (resolved with
 * assetUrl); the SDK editor manifest in src/assets.ts is untouched.
 * Placeholder entries point at files that do not exist yet and resolve to
 * procedural fallbacks at runtime (never a crash, never undefined).
 */

export type HivelordAssetType = 'model' | 'texture' | 'audio' | 'json' | 'image';
export type AssetGroupName = 'boot' | 'chapter1' | 'chapter2' | 'lazy';

export type FallbackKind =
  | 'bot'
  | 'bandit'
  | 'prop'
  | 'model'
  | 'texture'
  | 'texture-white'
  | 'audio'
  | 'image';

export const FALLBACK_KINDS: readonly FallbackKind[] = [
  'bot',
  'bandit',
  'prop',
  'model',
  'texture',
  'texture-white',
  'audio',
  'image',
];

export const ASSET_GROUPS: readonly AssetGroupName[] = [
  'boot',
  'chapter1',
  'chapter2',
  'lazy',
];

export interface ManifestEntry {
  id: string;
  type: HivelordAssetType;
  /** App-relative path, e.g. 'models/bot_01.glb'. */
  url: string;
  group: AssetGroupName;
  critical: boolean;
  fallbackId: FallbackKind;
  approxSizeKB: number;
  /** Budget: max triangles (models) or max texture dimension (textures). */
  triangles?: number;
  textureMax?: number;
  /** Origin: 'base' keeps y=0 at the floor, 'center' centers the bounds. */
  origin?: 'base' | 'center';
  /** Uniform scale applied after normalization. */
  scale?: number;
  /** Shared material slot, e.g. 'bot', 'prop_dark', 'glow_gold'. */
  material?: string;
  license: string;
  author: string;
  source: string;
  notes: string;
}

const DEFINITIONS: ManifestEntry[] = [
  // Boot: real placeholder geometry + key sounds (missing audio -> silence).
  {
    id: 'bot_01', type: 'model', url: 'models/bot_01.glb', group: 'boot',
    critical: true, fallbackId: 'bot', approxSizeKB: 1, triangles: 500,
    origin: 'base', scale: 1, material: 'bot',
    license: 'procedural (generated)', author: 'hivelord',
    source: 'scripts/gen-placeholders.mjs', notes: 'Cube stand-in for swarm bot.',
  },
  {
    id: 'bot_02', type: 'model', url: 'models/bot_02.glb', group: 'boot',
    critical: true, fallbackId: 'bot', approxSizeKB: 1, triangles: 500,
    origin: 'base', scale: 1, material: 'bot',
    license: 'procedural (generated)', author: 'hivelord',
    source: 'scripts/gen-placeholders.mjs', notes: 'Pyramid stand-in for swarm bot.',
  },
  {
    id: 'bot_03', type: 'model', url: 'models/bot_03.glb', group: 'boot',
    critical: true, fallbackId: 'bot', approxSizeKB: 1, triangles: 500,
    origin: 'base', scale: 1, material: 'bot',
    license: 'procedural (generated)', author: 'hivelord',
    source: 'scripts/gen-placeholders.mjs', notes: 'Shard stand-in for swarm bot.',
  },
  {
    id: 'sfx_click', type: 'audio', url: 'audio/sfx/sfx_click_01.mp3', group: 'boot',
    critical: false, fallbackId: 'audio', approxSizeKB: 8,
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'UI click; falls back to silence until recorded.',
  },
  {
    id: 'sfx_hover', type: 'audio', url: 'audio/sfx/sfx_hover_01.mp3', group: 'boot',
    critical: false, fallbackId: 'audio', approxSizeKB: 8,
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'UI hover tick; falls back to silence.',
  },
  {
    id: 'sfx_chime', type: 'audio', url: 'audio/chime.mp3', group: 'boot',
    critical: false, fallbackId: 'audio', approxSizeKB: 16,
    license: 'starter', author: 'starter', source: 'public/audio/chime.mp3',
    notes: 'Existing starter chime, also used by the robot.',
  },
  // Chapter 1 placeholders.
  {
    id: 'bandit_masked', type: 'model', url: 'models/bandit_masked.glb', group: 'chapter1',
    critical: false, fallbackId: 'bandit', approxSizeKB: 200, triangles: 8000,
    origin: 'base', scale: 1, material: 'bandit',
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Future enemy model.',
  },
  {
    id: 'bandit_hooded', type: 'model', url: 'models/bandit_hooded.glb', group: 'chapter1',
    critical: false, fallbackId: 'bandit', approxSizeKB: 200, triangles: 8000,
    origin: 'base', scale: 1, material: 'bandit',
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Future enemy model.',
  },
  {
    id: 'memory_shard', type: 'model', url: 'models/memory_shard.glb', group: 'chapter1',
    critical: false, fallbackId: 'prop', approxSizeKB: 60, triangles: 2000,
    origin: 'center', scale: 1, material: 'glow_gold',
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Collectible shard.',
  },
  {
    id: 'medallion', type: 'model', url: 'models/medallion.glb', group: 'chapter1',
    critical: false, fallbackId: 'prop', approxSizeKB: 60, triangles: 2000,
    origin: 'center', scale: 1, material: 'glow_gold',
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Skill medallion prop.',
  },
  {
    id: 'prop_bed_01', type: 'model', url: 'models/prop_bed_01.glb', group: 'chapter1',
    critical: false, fallbackId: 'prop', approxSizeKB: 300, triangles: 12000,
    origin: 'base', scale: 1, material: 'prop_dark',
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Room prop.',
  },
  {
    id: 'prop_table_01', type: 'model', url: 'models/prop_table_01.glb', group: 'chapter1',
    critical: false, fallbackId: 'prop', approxSizeKB: 150, triangles: 6000,
    origin: 'base', scale: 1, material: 'prop_dark',
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Room prop.',
  },
  {
    id: 'sigil_call', type: 'texture', url: 'textures/hivelord/sigil_call.webp', group: 'chapter1',
    critical: false, fallbackId: 'texture', approxSizeKB: 64, textureMax: 512,
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Ability sigil sprite.',
  },
  {
    id: 'sprite_glow', type: 'texture', url: 'textures/hivelord/sprite_glow.webp', group: 'chapter1',
    critical: false, fallbackId: 'texture-white', approxSizeKB: 16, textureMax: 128,
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Soft particle sprite.',
  },
  {
    id: 'voice_oldyou_intro', type: 'audio', url: 'audio/voice/voice_oldyou_intro_01.mp3', group: 'chapter1',
    critical: false, fallbackId: 'audio', approxSizeKB: 120,
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Intro voice line; lazy-decodable later.',
  },
  // Chapter 2 placeholders.
  {
    id: 'bandit_brute', type: 'model', url: 'models/bandit_brute.glb', group: 'chapter2',
    critical: false, fallbackId: 'bandit', approxSizeKB: 350, triangles: 15000,
    origin: 'base', scale: 1.2, material: 'bandit',
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Future heavy enemy.',
  },
  {
    id: 'sigil_shield', type: 'texture', url: 'textures/hivelord/sigil_shield.webp', group: 'chapter2',
    critical: false, fallbackId: 'texture', approxSizeKB: 64, textureMax: 512,
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Shield sigil sprite.',
  },
  // Lazy: loading art + existing banner.
  {
    id: 'still_loading', type: 'image', url: 'stills/still_loading_01.webp', group: 'lazy',
    critical: false, fallbackId: 'image', approxSizeKB: 200, textureMax: 1024,
    license: 'placeholder', author: 'hivelord', source: 'future art',
    notes: 'Loading screen art.',
  },
  {
    id: 'banner_webxr', type: 'model', url: 'gltf/webxr-banner/banner.gltf', group: 'lazy',
    critical: false, fallbackId: 'prop', approxSizeKB: 500, triangles: 20000,
    origin: 'base', scale: 1,
    license: 'starter', author: 'starter', source: 'public/gltf/webxr-banner',
    notes: 'Existing starter banner, loadable through the pipeline.',
  },
  // Test-only entries (failure paths, never shipped as content).
  {
    id: 'test_missing', type: 'model', url: 'models/does_not_exist.glb', group: 'lazy',
    critical: false, fallbackId: 'model', approxSizeKB: 1,
    license: 'test', author: 'hivelord', source: 'devtools',
    notes: 'Always 404s; exercises the fallback path.',
  },
  {
    id: 'test_corrupt', type: 'model', url: 'models/test_corrupt.glb', group: 'lazy',
    critical: false, fallbackId: 'model', approxSizeKB: 1,
    license: 'test', author: 'hivelord', source: 'scripts/gen-placeholders.mjs',
    notes: 'Truncated GLB; exercises the corrupt-file path.',
  },
  {
    id: 'test_texture', type: 'texture', url: 'textures/webxr.png', group: 'lazy',
    critical: false, fallbackId: 'texture', approxSizeKB: 340, textureMax: 1024,
    license: 'test', author: 'starter', source: 'public/textures/webxr.png',
    notes: 'Real 2260x640 PNG; exercises size clamp and warmup upload.',
  },
];

const BY_ID = new Map<string, ManifestEntry>(DEFINITIONS.map((e) => [e.id, e]));

export function getEntry(id: string): ManifestEntry | undefined {
  return BY_ID.get(id);
}

export function getGroup(name: AssetGroupName): ManifestEntry[] {
  return DEFINITIONS.filter((e) => e.group === name);
}

export function allEntries(): readonly ManifestEntry[] {
  return DEFINITIONS;
}

export interface ManifestIssue {
  kind: 'duplicate-id' | 'missing-fallback' | 'invalid-group' | 'missing-file';
  id: string;
  detail: string;
}

/** Static validation: ids, fallback kinds and groups (no filesystem access). */
export function validateManifest(): ManifestIssue[] {
  const issues: ManifestIssue[] = [];
  const seen = new Set<string>();
  for (const entry of DEFINITIONS) {
    if (seen.has(entry.id)) {
      issues.push({ kind: 'duplicate-id', id: entry.id, detail: 'id listed twice' });
    }
    seen.add(entry.id);
    if (!FALLBACK_KINDS.includes(entry.fallbackId)) {
      issues.push({
        kind: 'missing-fallback',
        id: entry.id,
        detail: `unknown fallback '${entry.fallbackId}'`,
      });
    }
    if (!ASSET_GROUPS.includes(entry.group)) {
      issues.push({
        kind: 'invalid-group',
        id: entry.id,
        detail: `unknown group '${entry.group}'`,
      });
    }
  }
  return issues;
}
