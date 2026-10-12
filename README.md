# NAURU: THE COUNTRYSIDE

A playable open-world prototype of Nauru with a GIS/material realism pass. It is a real-time third-person game—not a design mock-up—and uses an approximately 1:1 metre scale (`1 world unit = 1 metre`). The vehicle, structures, material art, UI, audio and procedural detail are original; open geographic sources are credited below.

## Download the Windows build

**[NauruCountryside-Windows-x64.exe](release/NauruCountryside-Windows-x64.exe)**

- Windows 10/11 x64
- Single portable 1.87 MiB executable; no installer
- Game code and material assets are embedded and work offline
- Opens in a dedicated Microsoft Edge app window (falls back to the default browser)
- SHA-256: `e7b80463032adfd7bf6be8248ec86cfb54626efb49f3ed70cbf3abf8f83c3c26`

Windows may show an “unknown publisher” warning because this prototype is not code-signed. The launcher source is in [`scripts/windows/launcher.c`](scripts/windows/launcher.c).

## What is playable

- Continuous Nauru-shaped island, approximately **5.7 × 6.1 km**
- Elevation model with coastal lowlands, central plateau, exposed limestone and mining scars
- Pacific ocean, translucent turquoise reef shelf, animated shore foam and Buada Lagoon
- Textured ring road, interior roads and a detailed functional airport runway/apron
- Official open-data outlines for all **14 Nauru districts**, used for live location lookup and map boundaries
- Streamed **600 m sectors** with frond-shaped coconut palms, tropical trees, detailed houses and coral pinnacles
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

This repository delivers the requested **terrain + ocean + third-person player + one original driveable car** milestone, plus a first geographic/material realism pass, airport, mapping, streaming, weather, audio and save systems. NPC traffic, motorcycles, boats, aircraft, helicopters and missions remain later milestones so this build stays playable and testable.

The coastline and district outlines use credited open geographic references. Elevation, roads, buildings and landmarks remain improving artistic approximations and are not suitable for navigation. No Google Maps, Street View, GTA, or other proprietary game assets/data are included.

## Data and licensing

- Coastline reference: USGS island linework, Sayre et al. (2018), converted from WGS84 to local metre coordinates.
- District outlines: geoBoundaries NRU ADM1, modified and transformed under CC BY 4.0.
- Full data and modification notes: [`ATTRIBUTION.md`](ATTRIBUTION.md).
- Three.js is used under its MIT license.
- Project source is MIT-licensed; see [`LICENSE`](LICENSE).
