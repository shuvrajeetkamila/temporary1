# NAURU: THE COUNTRYSIDE

A working Phase 1 open-world prototype of Nauru. It is a real-time third-person game—not a design mock-up—and uses an approximately 1:1 metre scale (`1 world unit = 1 metre`). All vehicles, buildings, materials, UI, audio and procedural art are original.

## Download the Windows build

**[NauruCountryside-Windows-x64.exe](release/NauruCountryside-Windows-x64.exe)**

- Windows 10/11 x64
- Single portable 643 KB executable; no installer
- Game code and assets are embedded and work offline
- Opens in a dedicated Microsoft Edge app window (falls back to the default browser)
- SHA-256: `4d7edaa99b5dd4d1b959efb7ff3a0f5f7b5b738a251d0390be3e3f8f83dfce4c`

Windows may show an “unknown publisher” warning because this prototype is not code-signed. The launcher source is in [`scripts/windows/launcher.c`](scripts/windows/launcher.c).

## What is playable

- Continuous Nauru-shaped island, approximately **5.7 × 6.1 km**
- Elevation model with coastal lowlands, central plateau and mining scars
- Pacific ocean, shoreline and Buada Lagoon
- Island ring road, interior roads and functional airport runway/apron
- Streamed **600 m sectors** with procedural palms, tropical trees, buildings and coral pinnacles
- Nauru International Airport, Civic Centre, Aiwo harbour, Anibare Bay, Command Ridge and Topside ruins
- Third-person walking, sprinting, jumping, crouching and coastal swimming
- Original **Island Runner** car with acceleration, braking, reverse, steering, traction, handbrake, wheel motion and terrain response
- Third- and first-person cameras with mouse orbit, zoom and ground collision avoidance
- Day/night lighting and clear, cloudy, rain and storm weather states
- Island map, minimap, districts, discovery markers and vehicle HUD
- Low/Medium/High/Ultra presets, sector LOD, instancing and autosave
- Procedural engine, ocean, rain, wind and footstep audio

## Controls

| Input | Action |
|---|---|
| `W A S D` | Move / drive |
| Mouse | Look around |
| `Shift` | Sprint |
| `Space` | Jump / handbrake |
| `C` | Crouch |
| `E` | Enter or exit the car |
| `V` | Toggle first/third person |
| Mouse wheel | Camera distance |
| `M` | Island map |
| `T` | Cycle weather |
| `Backspace` | Reset player/car to airport |
| `F6` | Quick save |
| `F3` | Streaming/performance overlay |
| `K` | Cinematic bars |
| `Esc` | Pause and graphics settings |

## Run from source

Requires Node.js 22+.

```bash
npm install
npm run dev
```

Then open the URL printed by Vite. Production verification:

```bash
npm run check
```

Rebuild the portable Windows executable:

```bash
npm run desktop:prepare
```

The desktop build script fetches a Zig cross-compiler only when needed, bundles the Vite output into a CRT-free Windows GUI launcher, and writes `release/NauruCountryside-Windows-x64.exe`.

## Current milestone

This repository delivers the requested **terrain + ocean + third-person player + one original driveable car** milestone, plus airport, mapping, streaming, weather, audio and save systems. NPC traffic, motorcycles, boats, aircraft, helicopters and missions are intentionally reserved for later milestones so this build remains playable and testable.

The geography is an artistic approximation and is not suitable for navigation. No Google Maps, Street View, GTA, or other proprietary game assets/data are included.

## Data and licensing

- Coastline reference: USGS island linework, Sayre et al. (2018), converted from WGS84 to local metre coordinates. See [`ATTRIBUTION.md`](ATTRIBUTION.md).
- Three.js is used under its MIT license.
- Project source is MIT-licensed; see [`LICENSE`](LICENSE).
