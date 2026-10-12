# QATAR: THE PENINSULA — clean 1 GiB offline foundation

This is a **new clean project**, separate from any prior repository application. It creates a direct-installation Android debug APK whose installed package includes eight independently seekable, deterministic regional `.qtrpack` sources totaling exactly **1 GiB (1,073,741,824 bytes)** before APK metadata/code/signing overhead. The final APK is therefore over the user's 1 GB minimum.

## What this milestone validates

- Android 8+ / API 26 baseline and GLES 3.0 launcher.
- Offline-only runtime: no `INTERNET` permission and no runtime download code.
- Packaged local-world index and eight non-compressed random-access regional bundles.
- An explicit packaging-size gate in CI, not a guessed or reported size.
- A source-free, reproducible build path that does not commit 1 GiB of generated binary data to Git.

## Accuracy boundary

The 1 GiB bundle comprises original deterministic procedural seed material and is a storage/streaming milestone, **not an authoritative full-Qatar GIS world**. National boundaries, municipal geometry, islands, roads, terrain, structures, coastlines, and named sites remain prohibited from claiming completion until legally sourced, verified, versioned datasets are added. The project does not claim AAA equivalence or physical-device performance validation.

Large outputs are intentionally published through GitHub Actions artifacts rather than Git history because standard Git hosts reject large individual files.
