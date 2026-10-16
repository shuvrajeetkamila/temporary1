#!/usr/bin/env python3
"""Real building-footprint importer.

Sources (auto-detected by extension):
  .osm      OSM XML exports (openstreetmap.org / Overpass with buildings)
  .geojson  GeoJSON FeatureCollection of building polygons (e.g. Mumbai SRA 2017)

Options:
  --hashh LO HI   when a source carries no heights: deterministic per-building
                  height in [LO,HI] metres (SRA rehab walk-ups: use 12 21)
  --cluster n1:x,y;n2:x,y;...   split buildings into named locality areas by
                  nearest anchor (world metres) so the engine streams them
                  per-neighbourhood instead of as one city-wide lump

Output: game/data/buildings_real.js
  const BUILDINGS3D={credit, areas:[{name,bb,bldgs:[{h,p:[x,y,...]}]}]}
The 3D engine renders each area as extruded real footprints (streamed).

Usage:
  python3 tools/import_footprints.py "Area Name" file1.osm [file2 ...]
"""
import json, math, os, sys
import xml.etree.ElementTree as ET

ANCHOR_LO, ANCHOR_LA = 72.95, 19.10
MLAT = 111320 * math.cos(ANCHOR_LA * math.pi / 180)
MLON = 110574

HEIGHT_PRIOR = {  # meters, by building class (Indian context)
    "house": 4.5, "hut": 3.0, "shed": 3.5, "garage": 3.0, "garages": 3.0,
    "residential": 15, "apartments": 21, "terrace": 15, "detached": 8,
    "commercial": 18, "retail": 12, "office": 30, "industrial": 12,
    "warehouse": 10, "church": 15, "temple": 12, "mosque": 12,
    "school": 12, "college": 18, "hospital": 24, "hotel": 30,
    "train_station": 15, "transportation": 10, "public": 15, "civic": 15,
    "government": 18, "kiosk": 3, "roof": 4, "service": 4, "yes": 9,
}
CREDIT = ("real footprints: OSM (ODbL) / Mumbai SRA 2017 (jkkersey, CC-BY); "
          "heights tagged or class/hash-prior, importer tools/import_footprints.py")


def x_m(lat, lon):
    return round((lon - ANCHOR_LO) * MLAT), round((lat - ANCHOR_LA) * MLON)


def _height(tags, hashh, seedx, seedy):
    bh = tags.get("height") or tags.get("height_m")
    if bh:
        try: return round(min(float(bh.replace("m", "").strip()), 320), 1)
        except ValueError: pass
    if tags.get("building:levels"):
        try: return round(min(float(tags["building:levels"]) * 3.3, 320), 1)
        except ValueError: pass
    if hashh:
        lo, hi = hashh
        hsh = (seedx * 73856093) ^ (seedy * 19349663)
        hsh = (hsh ^ (hsh >> 13)) & 0x7FFFFFFF
        return round(lo + (hsh % 1000) / 1000.0 * (hi - lo), 1)
    return round(HEIGHT_PRIOR.get(tags.get("building", "yes"), 9), 1)


def parse(path, hashh):
    bldgs = []
    if path.endswith(".geojson"):
        d = json.load(open(path, encoding="utf-8"))
        for f in d.get("features", []):
            g = f.get("geometry", {})
            polys = []
            if g.get("type") == "Polygon" and g.get("coordinates"):
                polys = [g["coordinates"]]
            elif g.get("type") == "MultiPolygon" and g.get("coordinates"):
                polys = g["coordinates"]
            props = {k: str(v) for k, v in (f.get("properties") or {}).items() if v is not None}
            for poly in polys:
                ring = poly[0] if poly else None
                if not ring or len(ring) < 3:
                    continue
                pts = [x_m(r[1], r[0]) for r in ring]
                if pts[0] == pts[-1]:
                    pts = pts[:-1]
                if len(pts) < 3:
                    continue
                cx = sum(q[0] for q in pts) // len(pts)
                cy = sum(q[1] for q in pts) // len(pts)
                h = _height(props, hashh, cx, cy)
                flat = []
                for (x, y) in pts:
                    flat += [x, y]
                bldgs.append({"h": h, "p": flat})
        return bldgs
    tree = ET.parse(path)
    root = tree.getroot()
    nodes = {}
    for n in root.iter("node"):
        nodes[int(n.get("id"))] = x_m(float(n.get("lat")), float(n.get("lon")))
    for w in root.iter("way"):
        tags = {t.get("k"): t.get("v") for t in w.findall("tag")}
        if "building" not in tags and "building:part" not in tags:
            continue
        refs = [int(r.get("ref")) for r in w.findall("nd")]
        pts = [nodes[r] for r in refs if r in nodes]
        if len(pts) < 3:
            continue
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        h = _height(tags, hashh, pts[0][0], pts[0][1])
        flat = []
        for (x, y) in pts[:-1]:
            flat += [x, y]
        bldgs.append({"h": h, "p": flat})
    return bldgs


def main():
    argv = sys.argv[1:]
    hashh, cluster, rest = None, None, []
    i = 0
    while i < len(argv):
        if argv[i] == "--hashh" and i + 2 < len(argv):
            hashh = (float(argv[i + 1]), float(argv[i + 2])); i += 3
        elif argv[i] == "--cluster" and i + 1 < len(argv):
            cluster = []
            for part in argv[i + 1].split(";"):
                nm, xy = part.rsplit(":", 1)
                x, y = xy.split(",")
                cluster.append((nm.strip(), int(x), int(y)))
            i += 2
        else:
            rest.append(argv[i]); i += 1
    if len(rest) < 2:
        print(__doc__); sys.exit(1)
    name = rest[0]
    bldgs = []
    for f in rest[1:]:
        got = parse(f, hashh)
        bldgs += got
        print(f"  {f}: {len(got)} buildings")
    if not bldgs:
        print("no buildings found"); sys.exit(1)

    def centroid(b):
        return sum(b["p"][0::2]) / (len(b["p"]) // 2), sum(b["p"][1::2]) / (len(b["p"]) // 2)

    areas = []
    if cluster:
        groups = {}
        for b in bldgs:
            cx, cy = centroid(b)
            nm = min(cluster, key=lambda c: (c[1] - cx) ** 2 + (c[2] - cy) ** 2)[0]
            groups.setdefault(nm, []).append(b)
        for nm, g in sorted(groups.items()):
            xs = [v for b in g for v in b["p"][0::2]]
            ys = [v for b in g for v in b["p"][1::2]]
            areas.append({"name": f"{nm} · {name}", "bb": [round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))], "bldgs": g})
            print(f"  {nm} · {name}: {len(g)} buildings")
    else:
        xs = [v for b in bldgs for v in b["p"][0::2]]
        ys = [v for b in bldgs for v in b["p"][1::2]]
        areas.append({"name": name, "bb": [round(min(xs)), round(min(ys)), round(max(xs)), round(max(ys))], "bldgs": bldgs})

    out = "game/data/buildings_real.js"
    existing = {"credit": CREDIT, "areas": []}
    if os.path.exists(out):
        try:
            s = open(out, encoding="utf-8").read()
            existing = json.loads(s[s.index("{"): s.rindex("}") + 1])
            existing.setdefault("credit", CREDIT)
        except Exception:
            pass
    newnames = {a["name"] for a in areas}
    existing["areas"] = [a for a in existing.get("areas", []) if a["name"] not in newnames] + areas
    js = "const BUILDINGS3D=" + json.dumps(existing, separators=(",", ":")) + ";\n"
    open(out, "w", encoding="utf-8").write(js)
    tot = sum(len(a["bldgs"]) for a in existing["areas"])
    print(f"{name}: +{len(areas)} area(s), {tot} real buildings total -> {out} ({len(js)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
