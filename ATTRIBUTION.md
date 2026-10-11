# Attribution and data notes

## Nauru coastline

The coastline control points in `src/data/nauruCoastline.js` were converted from WGS84 island linework attributed in the source record to:

> USGS: Sayre et al. (2018)

Reference mirror used during development:

- `richardvillagomez/pacific-islands-map/public/geojson/unsimplified/Nauru.geojson`
- Record name: Nauru
- Source field: `Linework_S: "USGS: Sayre et al. 2018"`

The coordinates are transformed to a local tangent-like metre grid around Nauru. Terrain heights, roads, districts, structures, vegetation, airport geometry and all other world detail are original procedural/artistic approximations. This build is not a survey or navigation product.

## Software

- [Three.js](https://github.com/mrdoob/three.js) — MIT License
- [Vite](https://github.com/vitejs/vite) — MIT License
- [Zig](https://github.com/ziglang/zig) is used only as a build tool for the Windows launcher; it is not bundled as source or a runtime dependency.

## Excluded sources

No Google Maps imagery, Google Street View imagery, GTA assets, proprietary map tiles, copied vehicle models, copied audio, or ripped game content are included.
