# Data sources and planned provenance

## Current toolchain milestone

No external geographic dataset is packaged. `app/src/main/assets/world/qatar_world_manifest.txt` is a versioned startup gate containing municipality names only; it is not a boundary, road, coastline, or building dataset.

## Required next data milestone

Before an authoritative-country claim, add reproducible open-data fetch manifests, source SHA-256 values, licenses, epoch dates, and processing reports for:

1. Qatar national and municipal boundary source.
2. OpenStreetMap extract for legal ODbL-derived roads, buildings, public exterior infrastructure, and place labels, with visible `© OpenStreetMap contributors` attribution in the app.
3. Redistributable DEM/bathymetry/land-cover sources.

No Google Maps, Google Earth, Street View, proprietary map tiles, or commercial-game assets are permitted.
