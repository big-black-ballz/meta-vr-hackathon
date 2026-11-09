# Hivelord (IWSDK / WebXR)

Level 0 foundation for **Hivelord: Rise of the Swarm King**.

```
core/      config, game state machine, event bus, time control
input/     gestures and hand tracking (Level 1)
swarm/     instanced bots and flocking (Levels 5-8)
abilities/ ability manager and abilities (Level 13)
enemies/   silhouettes, patrols, stun logic (Level 14)
ui/        in-world panels, HUD, menus (Level 3)
audio/     mixer, spatial sound, dialogue (Level 17)
game/      objectives, chapters, save integration (Level 15)
debug/     debug overlay and dev commands
```

Level 0: state machine, typed event bus, time control, debug overlay and the
legacy productivity flag.

Level 1: hand joint reading, six gestures (pinch, fist, flat palm, cupped,
open palm, two-palm stop), frame debounce and hysteresis, conflict priority,
dominant-hand setting, tracking-loss grace, forced-gesture dev keys and an
extended debug overlay. No swarm, abilities, UI menus or enemies yet.

Level 3: hands-only UI layer under `ui/`. Custom canvas-texture world-space
screens (start, loading, pause, settings, skills, chapter-complete, confirm,
error), non-blocking HUD (ability bar, charge ring, stun meter, objective
hint, toasts, subtitles, tracking banner), non-dominant wrist menu, settings
store (localStorage; this repo has no memory system), procedural UI tones (no
sound system in repo), input-context switching (blocking screens suspend
gameplay gestures), Level 2-lite placement helpers and a DOM pre-session
page. Placeholders only for unbuilt gameplay systems.
