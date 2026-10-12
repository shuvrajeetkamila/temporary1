# NAURU: THE COUNTRYSIDE

A working Phase 1 open-world prototype of Nauru. It is a real-time third-person game—not a design mock-up—and uses an approximately 1:1 metre scale (`1 world unit = 1 metre`). All vehicles, buildings, materials, UI, audio and procedural art are original.

## Standalone Windows game

**[Download NauruCountryside-Windows-x64.exe](release/NauruCountryside-Windows-x64.exe)**

- Windows 10/11 x64
- One portable **native Win32/OpenGL** executable; no installer and no companion folder
- Does **not** open Microsoft Edge, a browser tab, a URL, a localhost server, or an external launcher
- Uses only Windows system graphics libraries (`OPENGL32.dll`, `USER32.dll`, `GDI32.dll`, `KERNEL32.dll`)
- Offline: all terrain, ocean, island structures and gameplay geometry are generated inside the executable
- SHA-256: `70d91041ea5efaf3088de604145bb7e92f52aae2d7a73f66397e9bf69a906512`

Windows may show an “unknown publisher” warning because this prototype is not code-signed. The standalone runtime source is [`scripts/windows/native_game.c`](scripts/windows/native_game.c).

### Native EXE controls

| Input | Action |
|---|---|
| `W` / `S` | Walk, car/boat throttle, helicopter collective, or aeroplane throttle |
| `A` / `D` | Turn car/boat, helicopter yaw, or aeroplane roll |
| Arrow keys | Walk alternative / helicopter cyclic / aeroplane pitch |
| `Shift` | Sprint on foot |
| `Space` | Jump |
| `E` | Enter/exit nearby vehicle; exits are blocked when unsafe |
| `Z` | Start/stop the helicopter rotor after entering it |
| `V` | First-/third-person camera |
| `M` | Island overview camera |
| `T` | Cycle clear, cloud, rain and storm weather |
| `R` | Recover all vehicles and player to their spawn points |
| `F1` | In-game controls help |
| `Esc` | Quit |

## What is playable

### Standalone native edition

- Continuous Nauru-shaped Pacific island at approximately **5.7 × 6.1 km** scale
- Ocean, beach belt, low coastal settlements, raised central plateau, phosphate-style pinnacles and Buada depression
- Island ring road and a real-scale airport runway, apron, terminal and control tower
- Procedural tropical palms, modular homes, mining terrain and four original controllable vehicles
- **Island Runner** compact 4x4 with traction, braking and terrain response
- **Reef Workboat** with shared rendered-wave buoyancy, damping, thrust, steering and shoreline beaching resistance
- **Island Kestrel** light helicopter with rotor spool, collective, cyclic, anti-torque yaw, drag, ground effect and skid landings
- **Coastal STOL** propeller aircraft with throttle, lift/drag, stall attenuation, pitch/roll, runway gear contact and takeoff/landing behavior
- Third-person walking, sprinting, jumping, vehicle entry/exit, driving/flying, first-person camera and recovery/reset
- Day/night lighting plus clear, cloudy, rain and storm states

### Web development prototype

The included Three.js development prototype is kept as the richer iteration environment. It additionally contains streamed sectors, minimap/GPS waypoints, save support, quality presets, audio, camera orbit, swimming and the full procedural environment architecture. It is useful for development and testing, but it is **not** what the Windows EXE launches.

## Run the development prototype from source

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Then open the URL printed by Vite. Production verification:

```bash
npm run check
```

## Rebuild the standalone EXE

```bash
npm run desktop:prepare
```

The build script verifies the browser prototype, obtains Zig only when it is missing, then cross-compiles the native Win32/OpenGL game to `release/NauruCountryside-Windows-x64.exe`. It does not embed or invoke a web browser.

## Current milestone

This repository delivers the requested **terrain + ocean + third-person player + one original driveable car** milestone. NPC traffic, motorcycles, boats, aircraft, helicopters and missions are intentionally reserved for later milestones so the core remains playable and testable.

The geography is an artistic approximation and is not suitable for navigation. No Google Maps, Street View, GTA, or other proprietary game assets/data are included.

## Data and licensing

- Coastline reference: USGS island linework, Sayre et al. (2018), converted from WGS84 to local metre coordinates. See [`ATTRIBUTION.md`](ATTRIBUTION.md).
- Three.js is used under its MIT license for the browser development prototype.
- Project source is MIT-licensed; see [`LICENSE`](LICENSE).
