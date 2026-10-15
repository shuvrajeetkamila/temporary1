#!/usr/bin/env python3
"""Real building-footprint importer.

Drop OSM XML exports (any area — export from openstreetmap.org or Overpass
with buildings) into assets_src/footprints/*.osm, then run this. It produces
game/data/buildings_real.js which the 3D engine renders as extruded real
footprints (heights from building:levels / building:height / class priors).

Usage: python3 tools/import_footprints.py "Area Name" file1.osm [file2.osm ...]
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


def x_m(lat, lon):
    return round((lon - ANCHOR_LO) * MLAT), round((lat - ANCHOR_LA) * MLON)


def parse(path):
    tree = ET.parse(path)
    root = tree.getroot()
    nodes = {}
    for n in root.iter("node"):
        nodes[int(n.get("id"))] = x_m(float(n.get("lat")), float(n.get("lon")))
    out = []
    for w in root.iter("way"):
        tags = {t.get("k"): t.get("v") for t in w.findall("tag")}
        if "building" not in tags and "building:part" not in tags:
            continue
        refs = [int(r.get("ref")) for r in w.findall("nd")]
        pts = [nodes[r] for r in refs if r in nodes]
        if len(pts) < 3:
            continue
        # close ring
        if pts[0] != pts[-1]:
            pts.append(pts[0])
        h = None
        bh = tags.get("height")
        if bh:
            try: h = float(bh.replace("m", "").strip())
            except ValueError: h = None
        if h is None and tags.get("building:levels"):
            try: h = float(tags["building:levels"]) * 3.3
            except ValueError: h = None
        if h is None:
            h = HEIGHT_PRIOR.get(tags.get("building", "yes"), 9)
        flat = []
        for (x, y) in pts[:-1]:
            flat += [x, y]
        out.append({"h": round(min(h, 320), 1), "p": flat})
    return out


def main():
    if len(sys.argv) < 3:
        print(__doc__); sys.exit(1)
    name = sys.argv[1]
    bldgs = []
    xs, ys = [], []
    for f in sys.argv[2:]:
        got = parse(f)
        bldgs += got
        for b in got:
            xs += b["p"][0::2]; ys += b["p"][1::2]
        print(f"  {f}: {len(got)} buildings")
    if not bldgs:
        print("no buildings found"); sys.exit(1)
    data = {"name": name, "bb": [min(xs), min(ys), max(xs), max(ys)], "bldgs": bldgs}
    out = "game/data/buildings_real.js"
    existing = {"areas": []}
    if os.path.exists(out):
        try:
            s = open(out, encoding="utf-8").read()
            existing = json.loads(s[s.index("{"): s.rindex("}") + 1])
        except Exception:
            pass
    existing["areas"] = [a for a in existing.get("areas", []) if a["name"] != name]
    existing["areas"].append(data)
    js = "const BUILDINGS3D=" + json.dumps(existing, separators=(",", ":")) + ";\n"
    open(out, "w", encoding="utf-8").write(js)
    print(f"{name}: {len(bldgs)} buildings, bbox {data['bb']} -> {out} ({len(js)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
