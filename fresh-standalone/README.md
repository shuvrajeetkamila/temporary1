# NAURU: THE COUNTRYSIDE — Fresh Standalone EXE

This directory is an independent, from-scratch native Windows project. It does not import, launch, embed, or serve the repository's previous browser prototype.

## Build artifact

`release/Nauru-The-Countryside-Fresh-Standalone-Windows-x64.exe`

- Native x64 Windows GUI executable
- Uses system Win32/OpenGL libraries only
- No browser, URL, web server, local host, installer, external asset pack, telemetry, or login
- Fixed 60 Hz simulation accumulator
- Original procedural terrain and vehicle geometry

## Controls

- **W/S**: walk/throttle/collective as relevant
- **A/D**: turn/yaw/roll as relevant
- **Arrow keys**: helicopter cyclic or aeroplane pitch
- **Shift**: sprint on foot
- **Space**: jump
- **E**: enter/exit nearby vehicle
- **Z**: hold to spool the helicopter rotor
- **R**: deterministic reset/recovery
- **F1**: controls in the running game
- **Esc**: quit

## Implemented first-playable milestone

- Procedural Nauru-proportioned island, tropical terrain, coastline, ocean waves, central plateau/mining forms, settlement ring and airport runway
- Third-person walk/run/jump human controller
- Original compact car, workboat, helicopter and STOL aircraft meshes
- Force/velocity integrated vehicle controls: car driving, wave-driven boat buoyancy and beach resistance, helicopter rotor/collective/cyclic model, and propeller aeroplane lift/drag/stall model
- Day progression, fog and physically rendered ocean surface sharing the boat's analytic wave field

## Honest scope

This is a fresh **desktop EXE vertical slice**, not the Android APK requested by the pasted Android specification. Its world is an original deterministic approximation; it does not yet contain an OSM/SRTM data import, licensed third-party assets, animation/ragdoll, audio, production collision, Android thermal support, or physical-device validation. Those are intentionally not claimed as complete.

## Rebuild

From this directory:

```bash
node build.mjs
```

The build script downloads a Zig cross compiler only when unavailable, builds the standalone executable, and rejects output that is not an x64 Windows GUI PE binary.
