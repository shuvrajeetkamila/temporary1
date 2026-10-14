# Island Realm: Mumbai–Navi Mumbai 🌴🚂🚢✈️

An open-world playable recreation of the Mumbai–Navi Mumbai island region, built from the
`Mumbai_NaviMumbai_IslandGame_Prompt.txt` specification (780 location dossiers, 10 regions,
1,000+ km² of real geography).

**Play it:** browser preview at this repo's live preview (port 8080), or install
`dist/IslandRealm-Mumbai-debug.apk` on any Android 5.0+ phone (sideload: "install unknown apps").

## What's implemented from the spec

| Spec area | In the game |
|---|---|
| 780 location dossiers | Every dossier parsed (name, exact coordinates, elevation, atmosphere, landmark, NPC figure, community, soundscape, smellscape, signature drama, traffic, wildlife, building palette) and used to drive the world |
| Parts 1–10 regions | South Mumbai, Western Suburbs, Eastern Suburbs, Thane, Bhiwandi–Kalyan, Vasai-Virar, Navi Mumbai Core, Kharghar–Panvel, Uran & JNPT, Raigad Fringe — all reachable & discoverable |
| Real geography | Salsette + Konkan mainland polygons, Vasai & Thane creeks as live tidal water, Mumbai harbour, Elephanta/Butcher/Cross/Khanderi/Underi/Arnala/Karanja islands, Ulhas/Mithi/Panvel/Amba/Gadhi/Karanja rivers, Powai/Vihar/Tulsi/Ransai lakes, SGNP/Tungareshwar/Karnala forests & hills |
| Part A — minimap & wayfinding | Live minimap + full map with 10 toggleable layers, search, region explorer, graticule + scale bar |
| Part B — teleport physics & fairness | Teleport menu with 3 charges (75 s regen), fair-drop validation (never spawns you mid-creek on foot), waypoints |
| Part C — vehicles | Foot/run, car, kaali-peeli taxi, auto, bike, JNPT truck, ferry, speedboat, Cessna (runway physics: rotate >120 km/h, stall <100), helicopter (collective + tilt) — each with its own terrain physics |
| Local trains | Boardable WR/CR/Harbour/Trans-Harbour/Uran-line EMUs with station dwells, rush-hour frequency |
| Part D — NPC society | Archetypes from the dossiers (Koli fishers, dabbawalas at lunch hour, 8 am station crush, schoolchildren, port workers, pilgrims, joggers, night watchmen), umbrellas in the rain |
| Part E — environment | Day/night sun arc for 19°N, seasons (Jun–Sep monsoon with rain/lightning/flooded shoulders), semi-diurnal ~4 m tides (M2+S2+spring/neap), flamingos on the Thane creek flats at low tide, kites, ferries, JNPT barges, fishing boats |
| Part F — open data credit | Attribution in About + map footer (OpenStreetMap-derived geography, spec-verbatim location text) |
| Dossier landmarks | Every one of the 780 POIs draws its own spec-described landmark (market hall, church, school, station, chowky, stepwell…) |
| Stations | Railway station buildings at every stop of all 7 lines |
| Ferries | Boardable passenger ferries — stand at a jetty, press E as a boat passes |
| Economy | Delivery jobs between real dossiers (fish runs, dabbas, JNPT container papers, mango consignments), pay by distance, persistent wallet |
| Soundscape | Procedural sea/city/rain/wind beds, thunder, traffic horns, two-tone EMU horns, dawn birdsong near parks & water |
| Postcards | In-game photo capture stamped with the nearest dossier, saved on-device |
| App identity | AI-painted Gateway-of-India launcher icon across all densities via hand-built resources.arsc |

## Controls

- **Touch:** left joystick to move/steer, ▲▼ throttle/climb, 🚪 enter/exit/board, 🚗 vehicle menu, 🗺 map, ✨ teleport
- **Keyboard:** WASD/arrows move, Shift run, R/F climb, E enter/exit/board train, Space brake, M map, T teleport, V vehicles, H help

## Build system (no Android SDK used)

The APK is assembled entirely from open toolchain pieces — the sandbox has no access to
Google's SDK servers, so:

1. `tools/parse_spec.py` — parses all 780 dossiers out of the 11.5 MB prompt into `game/src/gen/pois.js`
2. `tools/build_game.py` — bundles 14 engine modules + data into one offline `www/index.html`
3. `python_apk/build_apk.py` — full pipeline:
   - compiles the WebView wrapper with **ECJ** (Eclipse compiler, vendored from a GitHub-hosted on-device IDE repo) against JetBrains' mock `rt.jar` stubs
   - dexes with the **dx** compiler (2011 AOSP dx, via a reflective launcher)
   - writes the **binary AndroidManifest.xml** with a from-scratch AXML encoder (string pool, resource-map chunk, namespace + element tree; attr resource IDs from the frozen framework `public.xml`)
   - **v1-signs** the JAR (SHA-256 digests + PKCS#7 detached via `cryptography`) with a generated RSA-2048 key
4. Validation suite: own AXML decoder, `pyaxmlparser`, `androguard` (manifest + DEX), `openssl smime -verify`, and a **real JVM `JarFile` verification** of every entry

`minSdk 21, targetSdk 29` (v1-signature installable on all current Android versions).

```bash
python3 tools/parse_spec.py     # regenerate location DB from the prompt
python3 tools/build_game.py     # bundle web game (also serves the live preview)
python3 python_apk/build_apk.py # compile + dex + manifest + sign -> dist/IslandRealm-Mumbai-debug.apk
node tools/smoke_test.js        # headless simulation test (12 checks)
```

Geography is stylised-but-faithful (hand-encoded from OSM-scale knowledge at macro fidelity);
location data is verbatim from the prompt document.
