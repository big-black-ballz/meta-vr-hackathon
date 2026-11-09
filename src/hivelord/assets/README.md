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

## Failure simulation (dev builds)

- `X` toggles the asset gallery (loaded models in a row with tri counts).
- `Z` cycles fail-sim: off, missing, corrupt, timeout, slow.
- `A` loads the lazy test group, `D` runs the unload round-trip,
  `S` reloads boot, `F` tests on-demand voice audio.
- A failing critical asset rejects its group and raises ErrorScreen.

## Validator and budgets

- `npm run check:assets` scans folders vs manifest (table above).
- `npm run check:ui-colors` still covers UI.
- Budgets live in `core/config.ts` (`ASSET_BUDGETS`): 100k scene tris,
  150 draw calls, 128 MB texture memory, 30 MB download, 15k/model,
  1024px/texture. Overruns warn in dev, naming the offender.
- `getStats()` exposes loaded/bytes/fallbacks/group timings.
- glTF-Transform is not installed. If Draco/Meshopt compression is wanted
  later: `npm i -D @gltf-transform/cli` then
  `gltf-transform optimize in.glb out.glb --compress draco` (draco needs the
  local `public/decoders/draco/` path, already vendored). Awaiting approval.
