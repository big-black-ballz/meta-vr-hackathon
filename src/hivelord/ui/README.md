# Hivelord UI (Obsidian Gold)

Every color lives in `theme.ts`. Components import tokens or `withAlpha()` /
`mix()`; they never hard-code hex, rgb, or `0x` colors. Run
`npm run check:ui-colors` to verify (exceptions are documented in
`scripts/ui-color-allowlist.json`).

## Tokens

| Token | Hex | Use |
| --- | --- | --- |
| `base` | `#0A0908` | Backdrops, pre-session page |
| `panel` | `#1A1612` | Panel fill base (legacy/compat) |
| `panelTop` | `#1F1A14` | Panel gradient top |
| `panelBottom` | `#14110D` | Panel gradient bottom |
| `panelRaised` | `#231D16` | Default button/row fill |
| `panelEdge` | `#3A3126` | Hairlines, meter tracks |
| `primary` | `#F5C451` | Gold: interaction, values, progress, active |
| `accent` | `#7A5CFF` | Violet fills, glows, icons |
| `accentText` | `#9D86FF` | Violet text (objective hint, speaker names) |
| `text` | `#F7F1E5` | Primary text |
| `textMuted` | `#B0A58F` | Secondary text |
| `textFaint` | `#8C826C` | Help text, locked sub-lines |
| `locked` | `#4F473A` | Disabled/locked fills and outlines only |
| `success` | `#6BE08A` | Ready flashes, success |
| `warning` | `#FF7A45` | Warnings only |
| `danger` | `#FF4D5A` | Stun meter, destructive actions |
| `textOnPrimary` | `#0A0908` | Text on gold buttons |

Derived alphas: primary 18% hover fill, 34% press fill, 50% border, 35% glow;
accent 35% glow. Use `withAlpha(primary, 0.18)` etc., never duplicate hex.

## Structure

- `theme.ts` — tokens, `withAlpha`, `mix`, `contrastRatio`, CSS variables.
- `draw/` — canvas helpers: `drawPanel`, `drawTitle`, `drawButton`,
  `drawToggleControl`, `drawStepperControl`, `drawProgressBar`, `drawRadial`,
  `drawHex`, icon set.
- `controls.ts` — control model and per-kind draw dispatch.
- `screen.ts` — dirty-flagged `CanvasPanel` + `UIScreen` base (unscaled time).
- `UIManager.ts` — stack/focus/input context.
- `screens-menu.ts`, `screens-system.ts` — menu flow and system screens.
- `hud.ts` — ability slots, charge ring, stun meter, objective plate, toasts,
  subtitles, tracking banner.
- `wrist.ts` — non-dominant wrist menu.
- `gallery.ts` — dev-only component gallery (hotkey G).
- `contrast.ts` — dev-only contrast table (hotkey V, also logged at startup).
- `presession.ts` — plain-DOM pre-session page using the same CSS variables.
- `settings.ts` — persisted settings (localStorage fallback; no memory system
  in this repository yet).

## Notes

- Panel chrome is drawn once per dirty redraw: vertical gradient, gold corner
  brackets, 4% hex lattice watermark, top highlight, inner glow and hairline.
  A shared 3D shadow plate sits 3 mm behind the focused panel; Start/Chapter
  raise a crest plate 2.5 mm in front for parallax.
- Hit meshes use a shared non-rendering material (`visible: false`) so they
  are raycastable but cost no draw calls.
- Settings is four tabs (Audio, Display, Hands, Comfort) with plate rows,
  icon medallions, 10-pip volume bars, segmented chips and animated toggles.
- Canvas textures are sRGB; UI materials set `toneMapped: false` and
  `depthWrite: false` so gold matches the token. Panel renderOrder 10, shadow
  1, ornament 12, hover sweep 13.
- Redraws are dirty-gated. HUD updates at most 10 Hz, debug overlay at 4 Hz,
  loading shimmer at 10 Hz.
- World visuals (swarm bots, Cloud sky, surface outlines) are separate and
  should read these tokens only where a UI accent is intended.
