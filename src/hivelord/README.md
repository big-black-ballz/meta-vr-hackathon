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

Level 0 only: state machine, typed event bus, time control, debug overlay and
the legacy productivity flag. Do not add swarm, abilities or enemies until
their levels are requested.
