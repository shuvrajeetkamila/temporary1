# QATAR: THE PENINSULA — new Android APK build

This is an independent clean-room Android project created after loading the Qatar offline-streaming specification. It is intentionally isolated from earlier repository game sources.

## Current milestone: Android toolchain + GLES3 gameplay spike

- Package: `ai.shuvrajeet.qatarpeninsula`
- Android: min SDK 26, target/compile SDK 35, Java 17
- Renderer: GLES 3.0 required, offline procedural 3D meshes only
- Runtime: fixed 60 Hz accumulator; touch controls; loading-to-gameplay launcher flow
- Packaged `QTRWORLD` manifest with all eight current municipality names validated at startup
- Pure force-model tests for jump height, boat buoyancy bounds, wing stall attenuation, and induced drag
- GitHub Actions creates a universal debug APK and SHA-256 sidecar without committing signing material

The first APK milestone is a real GLES3 scene and vehicle-physics toolchain spike. It is **not** a complete country build yet. No claim is made that current procedural geometry is authoritative Qatar geography; the prompt-required open-data acquisition, 1:1 national chunk compiler, Bullet integration, detailed vehicles, localization, streaming stress tests, and physical-device thermal evidence remain subsequent milestones.

## Build

Use the GitHub Actions workflow at `.github/workflows/qatar-apk.yml` when local Android tooling is unavailable. The workflow stages an APK only after unit tests and the manifest validation task pass.
