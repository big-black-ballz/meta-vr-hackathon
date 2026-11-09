# Hivelord assets

Runtime pipeline: `manifest.ts` (typed catalog) → `AssetManager.ts` (groups,
concurrency, retry, fallbacks) → SDK loaders (GLTF/audio/texture, cached).

## Folders (under `public/`)

- `models/` — `.glb` files only.
- `textures/hivelord/` — PNG/JPG/WebP, budgets in the manifest.
- `audio/voice/`, `audio/music/`, `audio/sfx/` — short clips.
- `ui/icons/` — UI sprites.
- `stills/` — loading/error art.
- `decoders/draco/`, `decoders/basis/` — vendored from the three package.
  Never load decoders from a CDN.

Existing starter files stay where they are (`gltf/`, `textures/webxr.png`,
`audio/chime.mp3`); nothing was moved or renamed.

## Naming rules

`category_name_variant.ext`, all lowercase, for example `prop_bed_01.glb`,
`bot_01.glb`, `sfx_click_01.mp3`, `voice_oldyou_intro_01.mp3`.

## Adding an asset

1. Drop the file in its folder following the naming rules.
2. Add a manifest entry in `manifest.ts` (id, type, relative url, group,
   critical, fallbackId, sizeKB, budgets, license/author/source/notes).
3. Pick or add a procedural fallback in `fallbacks.ts`.
4. Run `npm run check:assets` (validator) and keep the scene under budget.

## Load groups

`boot` (critical: placeholders + key SFX), `chapter1`, `chapter2`, `lazy`.
Boot drives the LoadingScreen; chapter1 preloads from the Start screen.

## Fallbacks in dev

Missing/corrupt/slow assets resolve to magenta-tinted procedural stand-ins
and increment the `fallbacks: N` counter in the debug overlay. Production
builds show neutral fallbacks with no warnings.
