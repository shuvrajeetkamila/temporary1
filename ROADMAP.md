# ISLAND REALM — REMAINING WORK (as of v4.1)

Built so far: installable APK (real-toolchain build, v1+v2 signed) · boot
screen + crash reporter · 26 km DEM terrain · 15,565 real OSM streets ·
3,398 real building footprints in 15 districts · koliwadas, chawls, night
markets, monsoon clouds/rain · traffic/trains/boats/NPCs · day-night sky
with stars/moon/rooftop lights · 15 district signs · tutorial, settings,
3 save slots · missions (delivery/fare/photo/tour) · garage/fuel/challans/
achievements · rides: metro, local trains, harbour ferry, coastal flight ·
postcards + export · tests: smoke 15/15 + feature 20/20.

## A. COMPLETE THE PHASES (short session items)
- [ ] Camera look/invert option (drag right side to look around; settings toggle)
- [ ] BEST bus vehicle type + bus-stop boarding (bus is drawn in traffic but not drivable)
- [ ] Ferry TIMETABLE: named routes (Gateway⇄Mandwa⇄Alibaug) with departure countdowns
- [ ] Full-line rail rides (ride any line start→end with per-station announcements)
- [ ] Fuel stations as physical places on the map (drive-in refuel)
- [ ] Market/station crowds (instanced pedestrians near POIs) — gulls exist, people don't
- [ ] Golden-hour sky tinting + sun disc
- [ ] Hindi/Marathi UI strings (spec requires bilingual flavour; toasts + HUD first)
- [ ] Save-file export/import (share your city between devices)

## B. MORE REAL DATA (world mass toward the honest GB tier)
- [ ] Thane, Panvel, Mira-Bhayandar, Kalyan-Dombivli building surveys (same sources as Navi Mumbai)
- [ ] Street networks east of the harbour (current 7 OSM areas are Mumbai-side)
- [ ] More height-tagged datasets (height_m sources found once → hunt systematically)
- [ ] Real SRTM elevation (source host still blocked; keep retrying / drop-in ready)
- [ ] LOD + streaming hardening for 50k–200k buildings (instancing budgets, fog cull)

## C. GAME DEPTH
- [ ] Mission chains from the 780 dossiers (multi-step stories with real names/history)
- [ ] Vehicle running costs (fuel price fluctuation, repairs after crashes)
- [ ] Crash damage + repair shops
- [ ] More achievements (tiers: bronze/silver/gold per activity)
- [ ] Daily challenges (deterministic from the real IST clock)

## D. SPECTACLE
- [ ] Monsoon flooding: low-lying areas (DEM < 3 m) flood visually during heavy rain
- [ ] Ganpati procession crowd event (seasonal, dossier-faithful)
- [ ] Fireworks at Marine Drive on select dates
- [ ] SeaLink toll plaza gates that open as you pass

## E. INFRA
- [ ] GitHub Release asset hosting (upload blocked by sandbox proxy — retry each round)
- [ ] Low-end device profile: reduce instance counts + shadows when fps < 30 (auto)

Order: A first (small, high-visibility), then B (mass), then C/D.
