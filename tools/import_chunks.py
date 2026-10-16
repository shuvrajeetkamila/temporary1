#!/usr/bin/env python3
"""Ingest chunked city building data (data/starter/chunks/*.json, world-metre
coords, anchor 72.95E/19.10N — same grid as the game) into buildings_real.js.

Each chunk becomes a streaming area named by its chunk id. Height source:
b.H (metres) else b.F floors*3.3 else type prior, capped at 320 m.
"""
import json, os, sys

OUT = "game/data/buildings_real.js"
PRIOR = {"residential": 15, "commercial": 18, "industrial": 12, "mixed": 15,
         "retail": 12, "office": 30, "public": 15, "amenity": 12, "Building": 9}


def load_existing():
    if os.path.exists(OUT):
        s = open(OUT, encoding="utf-8").read()
        return json.loads(s[s.index("{"): s.rindex("}") + 1])
    return {"credit": "city ingest", "areas": []}


def main():
    folder = sys.argv[1] if len(sys.argv) > 1 else "assets_src/footprints/chunks"
    existing = load_existing()
    have = {a["name"] for a in existing["areas"]}
    added = 0
    for fn in sorted(os.listdir(folder)):
        if not fn.endswith(".json"):
            continue
        name = "City Grid " + fn.replace("chunk_", "").replace(".json", "")
        if name in have:
            continue
        d = json.load(open(os.path.join(folder, fn), encoding="utf-8"))
        blds = []
        xs, ys = [], []
        for b in d.get("b", []):
            ring = b.get("r") or (b.get("p") or [[]])[0]
            if len(ring) < 3:
                continue
            h = b.get("H")
            if not h and b.get("F"):
                h = b["F"] * 3.3
            if not h:
                h = PRIOR.get(b.get("t") or "Building", 9)
            h = round(min(float(h), 320), 1)
            flat = []
            for pt in ring:
                flat += [round(pt[0]), round(pt[1])]
                xs.append(pt[0]); ys.append(pt[1])
            if len(flat) >= 6:
                blds.append({"h": h, "p": flat})
        if not blds:
            continue
        existing["areas"].append({"name": name,
                                  "bb": [round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))],
                                  "bldgs": blds})
        added += len(blds)
        print(f"  {name}: {len(blds)} buildings")
    js = "const BUILDINGS3D=" + json.dumps(existing, separators=(",", ":")) + ";\n"
    open(OUT, "w", encoding="utf-8").write(js)
    tot = sum(len(a["bldgs"]) for a in existing["areas"])
    print(f"total now {tot} real buildings in {len(existing['areas'])} areas -> {OUT} ({len(js)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
