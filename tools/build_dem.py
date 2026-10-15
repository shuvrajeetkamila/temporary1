#!/usr/bin/env python3
"""Elevation model for the 3D world.

Layer 1 (now): SPEC_DEM — grid interpolated (IDW) from the 780 dossier
elevations in the prompt (each sourced from NASADEM/SRTM per the spec).
Layer 2 (auto-upgrade): if assets_src/dem/*.hgt (SRTM HGT tiles) are dropped in,
they REPLACE the grid with real 30m/90m data. The engine just samples whatever
the build produced. Output: game/data/dem.js  (const SPEC_DEM={...})
"""
import json, math, os, struct, sys

ANCHOR_LO, ANCHOR_LA = 72.95, 19.10
NX, NY = 200, 140                      # grid: 73.50-72.55 wide, 19.70-18.55 tall
DX, DY = 0.95 / (NX - 1), 1.15 / (NY - 1)   # degrees per cell
MLAT = 111320 * math.cos(ANCHOR_LA * math.pi / 180)
MLON = 110574


def load_pois():
    s = open("game/src/gen/pois.js", encoding="utf-8").read()
    return json.loads(s[s.index("["): s.rindex(";")])


def idw_grid(pois):
    h = [0.0] * (NX * NY)
    pts = [(p["lo"], p["la"], max(0.6, min(90.0, p.get("el", 4)))) for p in pois]
    for j in range(NY):
        la = 19.70 - j * DY
        for i in range(NX):
            lo = 72.55 + i * DX
            wsum, vsum = 0.0, 0.0
            for (plo, pla, pel) in pts:
                d2 = ((lo - plo) * MLAT) ** 2 + ((la - pla) * MLON) ** 2
                if d2 < 1.0e6:  # 1 km² floor
                    w = 1.0e6 / (d2 + 2.5e5)
                elif d2 < 1.44e8:  # 12 km cut-off radius
                    w = 1.0e6 / (d2 + 2.5e5)
                else:
                    continue
                wsum += w
                vsum += w * pel
            h[j * NX + i] = round(vsum / wsum, 1) if wsum > 0 else 3.0
    return h


def try_hgt(h_grid):
    """If real SRTM tiles exist, overwrite the grid from them (big-endian int16)."""
    src = "assets_src/dem"
    if not os.path.isdir(src):
        return False
    used = 0
    for f in os.listdir(src):
        if not f.endswith(".hgt"):
            continue
        n = int(round(math.sqrt(os.path.getsize(src + "/" + f) / 2)))
        if n not in (1201, 3601):
            continue
        la0 = int(f[1:3]); lo0 = int(f[4:7])
        data = struct.unpack(">%dh" % (n * n), open(src + "/" + f, "rb").read())
        for j in range(NY):
            gla = 19.70 - j * DY
            for i in range(NX):
                glo = 72.55 + i * DX
                if la0 <= gla < la0 + 1 and lo0 <= glo < lo0 + 1:
                    fx = (glo - lo0) / 1.0 * (n - 1)
                    fy = (la0 + 1 - gla) / 1.0 * (n - 1)
                    x0, y0 = int(fx), int(fy)
                    if x0 >= n - 1 or y0 >= n - 1:
                        continue
                    v00 = data[y0 * n + x0]; v10 = data[y0 * n + x0 + 1]
                    v01 = data[(y0 + 1) * n + x0]; v11 = data[(y0 + 1) * n + x0 + 1]
                    tx, ty = fx - x0, fy - y0
                    v = (v00 * (1 - tx) * (1 - ty) + v10 * tx * (1 - ty) +
                         v01 * (1 - tx) * ty + v11 * tx * ty)
                    if v > -100:
                        h_grid[j * NX + i] = round(max(0.2, v), 1)
        used += 1
    return used > 0


def main():
    pois = load_pois()
    grid = idw_grid(pois)
    src = "spec dossiers (780 elevations)"
    if try_hgt(grid):
        src = "REAL SRTM HGT tiles"
    out = {"nx": NX, "ny": NY, "x0": 72.55, "y0": 18.55, "dx": DX, "dy": DY, "h": grid}
    js = "const SPEC_DEM=" + json.dumps(out, separators=(",", ":")) + ";\n"
    os.makedirs("game/data", exist_ok=True)
    open("game/data/dem.js", "w", encoding="utf-8").write(js)
    print(f"DEM grid {NX}x{NY} from {src} -> game/data/dem.js ({len(js)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
