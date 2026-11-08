# Meta VR Hackathon Starter — IWSDK Mixed Reality

A mixed-reality **WebXR** starter for Meta Quest, built with Meta's
[Immersive Web SDK (IWSDK)](https://developers.meta.com/vr/documentation/iwsdk/guides/overview/),
Three.js, Vite, and TypeScript. Open a URL in Meta Quest Browser and enter
passthrough MR — no native build, no APK.

This template was generated with `npm create @iwsdk@1.0.1` using the
**Mixed reality / passthrough** starting point, then verified: `npm run typecheck`
and `npm run build` both pass.

> **Terms used below**
> **XR** = an immersive session (VR or MR) presented by the headset instead of a
> flat page. **MR** = mixed reality; passthrough shows your real room while
> virtual content is drawn into it. **IWER** = the browser-based XR emulator that
> lets you test without a headset. **ECS** = entity-component system, the
> data-oriented architecture IWSDK uses on top of Three.js.

---

## Requirements

| Requirement | Version / notes |
| --- | --- |
| Node.js | `20.19+`, `22.12+`, or `24+` (Node 24 recommended; see `.nvmrc`) |
| npm | Included with Node.js |
| Desktop browser | Current Chrome or Edge |
| Headset (optional) | Meta Quest 3 / 3S / Pro on the same Wi-Fi as your PC |

WebXR requires a **secure context**. The managed dev server generates a local
HTTPS certificate automatically, so `https://localhost:<port>` and the LAN URL
both work. A headset will show a certificate warning the first time — accept it.

## Quick start

```bash
npm install
npm run dev
```

`npm run dev` starts the IWSDK-managed Vite server and opens a managed Chromium
window. Use the **Runtime / Editor** toggle in that window to switch between the
running experience and the authored scene.

> First run only: the managed browser downloads a dedicated Chromium build
> (a few hundred MB) for desktop XR emulation. Later runs start much faster.
> The port is chosen by Vite — use the URL printed by `npm run dev`, not a
> hard-coded `5173`.

### Test without a headset (IWER)

Click **Enter XR** on the page. Use the IWER toolbar:

- **Play mode** locks the pointer for mouse-look.
- `Left Shift` + `WASD` moves the emulated headset.
- Left mouse = right trigger/select; right mouse = right grip/squeeze.
- **Toggle input mode** switches between controllers and hands.

Full control reference: <https://iwsdk.dev/guides/02-testing-experience.html#iwer-controls>

### Test on a Meta Quest

1. Put the headset on the **same Wi-Fi network** as your PC.
2. Run `npm run dev` and find the `Network:` URL in the output
   (for example `https://192.168.1.100:8081/` — use the port Vite prints).
   `npm run dev:status` also reports the current URL.
3. Open that URL in **Meta Quest Browser**.
4. Accept the self-signed certificate warning.
5. Click **Enter XR** — the app requests an `immersive-ar` session and starts
   in passthrough.

If the LAN URL is blocked by a firewall or corporate network, forward the port
with ADB and open `https://localhost:5173` on the headset instead:
<https://developers.meta.com/vr/documentation/iwsdk/guides/02-testing-experience/>

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the managed workspace (headed, resizable) |
| `npm run dev:collaborate` | Start an AI **collaborate** session (headed, shared with you) |
| `npm run dev:agent` | Start an AI **agent** session (headless, fixed 800x800 viewport) |
| `npm run dev:status` | Show runtime URL, port, and adapter/bridge state |
| `npm run dev:down` | Stop a managed session running in the background |
| `npm run typecheck` | Type-check with `tsc --noEmit` |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run reference:status` | Check the shared IWSDK reference-asset cache |
| `npm run reference:warmup` | Re-download reference assets if needed |

Run `npm run typecheck` before every device test. Type errors can stop systems
from initialising without an obvious browser error.

## Project structure

```text
meta-vr-hackathon/
├── iwsdk.config.json            # Project authority: scene, assets, components, XR features
├── index.html                   # Page shell and #scene-container
├── vite.config.ts               # Wires the IWSDK dev plugin (do not put config here)
├── public/
│   ├── scenes/main.iwsdk.scene.json   # Authored scene composition (no URLs/geometry)
│   ├── ui/welcome.uikitml             # Spatial UI markup
│   ├── gltf/webxr-banner/             # Local glTF starter asset
│   ├── textures/ and audio/           # Runtime-loaded assets
├── src/
│   ├── index.ts                 # World.create() + explicit system registration
│   ├── assets.ts                # defineAssets() catalog, shared by runtime and editor
│   ├── components.ts            # defineComponents() catalog, shared by runtime and editor
│   ├── panel.ts                 # Starter panel system
│   ├── robot.ts / robot-component.ts  # Starter robot system + component
│   └── AGENTS.md                # Scoped ECS/API guidance for this folder
├── .agents/ and .claude/        # IWSDK agent skills used by AI coding tools
├── AGENTS.md                    # Project rules for AI agents (read this first)
└── .github/workflows/ci.yml     # Typecheck + build on push/PR
```

## What is already wired

`iwsdk.config.json` currently sets:

```jsonc
{
  "world": {
    "xr": {
      "mode": "ar",              // immersive-ar / passthrough
      "offer": "always",
      "features": { "handTracking": true }
    },
    "features": {
      "locomotion": false,
      "grabbing": true,
      "physics": false,
      "sceneUnderstanding": false,
      "environmentRaycast": false,
      "spatialUI": { "kit": "horizon" }
    }
  },
  "dev": {
    "emulator": { "device": "metaQuest3", "environment": "living_room" }
  }
}
```

Starter content:

- **Plant** — `DistanceGrabbable` (aim with a ray and pull the trigger).
- **Robot** — press it; it turns toward you and plays a chime
  (`RobotSystem` in `src/robot.ts`).
- **Welcome panel** — `ScreenSpace` UIKitML panel from `public/ui/welcome.uikitml`.
- **WebXR banner** — a local glTF placed behind the player.

### Turning features on

Edit `iwsdk.config.json` and change the feature flags. The dev server restarts
in place; no separate config file needs editing.

| Feature | Use it for |
| --- | --- |
| `grabbing` | Picking up and moving virtual objects (already on) |
| `physics` | Gravity, collisions, and physically driven grabbing |
| `locomotion` | Teleport/slide movement in VR-style scenes. Add a `LocomotionEnvironment` component to walkable geometry or the player will fall through the world |
| `sceneUnderstanding` | Room/plane data from the headset. May prompt the user for space setup |
| `environmentRaycast` | Hit-testing real-world surfaces to place content in the room |
| `spatialUI` | Horizon-styled UIKit panels (already on) |

> **MR tip:** passthrough itself does not require room setup. Plane/room data and
> environment raycasts do — expect a space-setup prompt the first time you enable
> `sceneUnderstanding` or `environmentRaycast`, and handle the "no room data"
> case gracefully.

## Deploying for judges or teammates

```bash
npm run build
```

Upload `dist/` to any static host that serves **HTTPS**: Vercel, Netlify,
Cloudflare Pages, GitHub Pages, etc. Vercel/Netlify are the fastest option and
produce an HTTPS URL you can open directly in Quest Browser.

- If the site is served from a subpath (e.g. `username.github.io/repo/`), set
  Vite's `base` accordingly; `src/assets.ts` already builds public URLs from
  `import.meta.env.BASE_URL`.
- To ship as a PWA on the Meta Horizon Store, see
  <https://developers.meta.com/vr/documentation/web/pwa-overview/> and the
  `iwsdk-pwa-packaging` skill in `.agents/skills/`.

## Troubleshooting

| Symptom | Likely cause / fix |
| --- | --- |
| No **Enter XR** button | Page is not HTTPS, or the browser has no WebXR support. Use the managed server URL and accept the certificate |
| Headset cannot load the LAN URL | PC and headset on different networks, or firewall blocking the port. Use ADB port forwarding, or run `npm run dev:status` to confirm the URL |
| Scene goes black after an edit | HMR occasionally breaks an active XR session — do a full page reload |
| Assets missing in the headset only | CORS or a URL that assumes the site root. Register files in `src/assets.ts` and build URLs from `import.meta.env.BASE_URL` |
| Sluggish frame rate | Quest Browser defaults to 72 Hz. Keep draw calls under ~100 on Quest 3, compress textures (KTX2/Basis), and avoid per-frame allocations |
| Types pass but a system never runs | Check the browser console with no level filter, then confirm the entity and components with the IWSDK ECS tools |

## Agentic coding with OpenCode

This template is wired for OpenCode out of the box.

### MCP servers

`opencode.json` registers three local MCP servers:

| Server | What the agent gets |
| --- | --- |
| `iwsdk-runtime` | 45 tools: XR session/input, browser evidence, native scene authoring, UIKitML previews, and ECS inspection |
| `iwsdk-reference` | IWSDK reference and asset discovery |
| `metavr` | Meta docs search, device control, logs, screenshots, and performance tracing |

Verify the connections from the project root:

```bash
opencode mcp list
```

### Skills and instructions

OpenCode auto-discovers the IWSDK skills in `.agents/skills/` (project
compatibility), including `iwsdk-dev`, `iwsdk-build-model`,
`iwsdk-compose-scene`, `iwsdk-ui`, `iwsdk-physics`, `iwsdk-grab`, `iwsdk-ray`,
`iwsdk-debug`, `iwsdk-depth-occlusion`, `iwsdk-hosting`,
`iwsdk-native-xr-test`, and `iwsdk-pwa-packaging`.

The root `AGENTS.md` is loaded automatically, along with the scoped
`src/AGENTS.md`, `public/scenes/AGENTS.md`, and `public/ui/AGENTS.md` files.
Read `AGENTS.md` first: IWSDK is **not** standard Vite in several important ways
(config authority, virtual modules, managed dev server).

Confirm skill discovery:

```bash
opencode debug skill
```

### Start an AI session

| Command | Mode | Browser |
| --- | --- | --- |
| `npm run dev` | Workspace-only | Headed, resizable |
| `npm run dev:collaborate` | Collaborate | Headed; you and the agent share the session |
| `npm run dev:agent` | Agent | Headless, fixed 800x800 viewport |

The first agent-mode launch can take 60–90 seconds while headless Chromium
starts, so the scripts allow 120 seconds. If startup still times out, use
`npm run dev:collaborate` or pass a larger `--timeout`.

Wait for both readiness fields before issuing MCP commands:

```bash
npm run dev:status
```

`state.browserCommandReady` and `state.session.browser.commandReady` must both
be `true`. An HTTP response alone does not mean the browser bridge is ready.

Inspect the installed tool contract:

```bash
npx iwsdk mcp inspect
npx iwsdk mcp inspect --tool scene_render_file
```

### First request

> Use the IWSDK runtime tools to check the XR session, capture the application
> runtime, and report any console errors.

This should call `xr_get_session_status`, `browser_screenshot`, and
`browser_get_console_logs`. A screenshot taken through `browser_screenshot`
always captures the running app, even when the Editor view is visible.

### Verified workflows

**Runtime behavior**

1. `browser_get_console_logs` and record the initial errors.
2. Edit source, then `browser_reload_page`.
3. Wait for command readiness again.
4. Exercise the behavior through XR or ECS tools.
5. `browser_screenshot` and read the logs again.

**Native scene authoring**

1. `scene_get_capabilities({ full: true })`.
2. Edit `public/scenes/*.iwsdk.scene.json` with normal file tools.
3. `scene_render_file` for every changed module, then the composed root.
4. `scene_flatten_file` once to the path named by `iwsdk.config.json`.
5. `scene_open` the flattened, import-free output.
6. `scene_get_state` to confirm clean diagnostics and hashes.
7. `scene_set_camera` + `scene_screenshot` for authored evidence.
8. Verify behavior separately with `browser_screenshot` and console logs.

**XR interaction**

1. `xr_get_session_status`, then `xr_accept_session` if offered.
2. `xr_set_input_mode` (`controller` or `hand`).
3. `xr_set_connected` for each emulated input device.
4. `scene_get_runtime_hierarchy` and `scene_get_object_transform`.
5. `xr_look_at` and `xr_select` (or `xr_set_select_value` for a held input).
6. `browser_screenshot` + console logs.

**ECS debugging**

1. `ecs_list_systems` and `ecs_list_components`.
2. `ecs_find_entities`, then `ecs_query_entity`.
3. `ecs_pause`, labeled `ecs_snapshot`, `ecs_step` or `ecs_set_component`.
4. Second snapshot + `ecs_diff`.
5. `ecs_resume` even when no defect is found.

Editor screenshots are not proof of runtime behavior. Pose and interaction
claims require an active XR session; check `xr_get_session_status` first.

### Version note

The installed OpenCode CLI is the V1 line, so `opencode.json` uses the
V1-compatible `mcp.<name>` + `permission` shape. OpenCode V2 accepts this shape
as compatibility; a native V2 install can migrate it to `mcp.servers` and the
`permissions` array without changing the server commands.

Official references:
[AI overview](https://developers.meta.com/vr/documentation/iwsdk/ai/getting-started/),
[modes](https://developers.meta.com/vr/documentation/iwsdk/ai/modes/),
[MCP tools](https://developers.meta.com/vr/documentation/iwsdk/ai/mcp-tools/),
[workflows](https://developers.meta.com/vr/documentation/iwsdk/ai/workflows/).

## Version notes

| Package | Version |
| --- | --- |
| `@iwsdk/core` | `1.0.1` (latest stable at template creation) |
| `@iwsdk/cli` / `@iwsdk/vite-plugin-dev` | `1.0.1` |
| Three.js | `super-three@0.181.0` (aliased as `three`) |
| Vite | `^7.1.4` |

IWSDK 1.1 is published as a release candidate (`1.1.0-rc.*`). This template stays
on the stable 1.0.1 line so the hackathon build is reproducible. Upgrade only if
you need a 1.1 feature and can absorb API changes.

## License

MIT. Starter code and assets originate from Meta's IWSDK templates, which are
also MIT-licensed. See [LICENSE](./LICENSE).
