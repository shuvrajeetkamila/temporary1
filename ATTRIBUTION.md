# Attribution and data notes

## Nauru coastline

The coastline control points in `src/data/nauruCoastline.js` were converted from WGS84 island linework attributed in the source record to:

> USGS: Sayre et al. (2018)

Reference mirror used during development:

- `richardvillagomez/pacific-islands-map/public/geojson/unsimplified/Nauru.geojson`
- Record name: Nauru
- Source field: `Linework_S: "USGS: Sayre et al. 2018"`

The coordinates are transformed to a local tangent-like metre grid around Nauru.

## District boundaries

The 14 district polygons in `src/data/nauruDistricts.js` are transformed and rounded derivatives of **geoBoundaries NRU ADM1**, licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The source was retrieved from the MapCraft mirror of the geoBoundaries open release:

- Dataset: `geoBoundaries-NRU-ADM1.geojson`
- Project: [wmgeolab/geoBoundaries](https://github.com/wmgeolab/geoBoundaries)
- Citation: Runfola, D. et al. (2020), “geoBoundaries: A global database of political administrative boundaries,” *PLOS ONE* 15(4): e0231866.
- License: CC BY 4.0
- Modifications: WGS84 longitude/latitude positions were projected to the game's local metre grid, rounded, and emitted as JavaScript arrays; map label points were computed and one concave-polygon label was manually moved inside its district.

Terrain heights, roads, structures, vegetation, airport geometry and other world detail remain original procedural/artistic approximations informed by the open geography. This build is not a survey or navigation product.

## Original material assets

The ground, asphalt and concrete albedo images in `public/textures/` were generated specifically for this project. Their associated normal and roughness textures are generated deterministically at runtime. They contain no map or satellite imagery.

## Software

- [Three.js](https://github.com/mrdoob/three.js) — MIT License
- [Vite](https://github.com/vitejs/vite) — MIT License
- [Zig](https://github.com/ziglang/zig) is used only as a build tool for the Windows launcher; it is not bundled as source or a runtime dependency.

## Excluded sources

No Google Maps imagery, Google Street View imagery, GTA assets, proprietary map tiles, copied vehicle models, copied audio, or ripped game content are included.
