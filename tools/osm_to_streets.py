#!/usr/bin/env python3
"""Parse real OpenStreetMap XML extracts (Mumbai key areas) into compact street
tiles for the 3D world. Output: game/data/streets_real.json
Coordinates: meters relative to the game's global anchor (72.95E, 19.10N),
same projection the engine uses. Attribution: (c) OpenStreetMap contributors, ODbL."""
import xml.etree.ElementTree as ET
import json, os, math, sys

SRC = "assets_src/osm"
OUT = "game/data/streets_real.json"
ANCHOR_LO, ANCHOR_LA = 72.95, 19.10
MLAT = 111320 * math.cos(ANCHOR_LA * math.pi / 180)
MLON = 110574

CLASS_MAP = {
    "motorway": 0, "motorway_link": 0, "trunk": 0, "trunk_link": 0,
    "primary": 1, "primary_link": 1,
    "secondary": 2, "secondary_link": 2, "tertiary": 2, "tertiary_link": 2,
    "unclassified": 3, "residential": 3, "living_street": 3,
    "service": 4, "pedestrian": 4, "footway": 5, "path": 5, "cycleway": 5, "steps": 5,
}
WIDTHS = {0: 18.0, 1: 15.0, 2: 11.0, 3: 7.0, 4: 5.0, 5: 3.0}


def x(lat, lon):
    return round((lon - ANCHOR_LO) * MLAT), round((lat - ANCHOR_LA) * MLON)


def parse_file(path, area_name):
    tree = ET.parse(path)
    root = tree.getroot()
    nodes = {}
    for n in root.iter("node"):
        nid = int(n.get("id"))
        nodes[nid] = x(float(n.get("lat")), float(n.get("lon")))
    streets = []
    maxspeeds = []
    for w in root.iter("way"):
        tags = {t.get("k"): t.get("v") for t in w.findall("tag")}
        hw = tags.get("highway")
        if not hw:
            continue
        cls = CLASS_MAP.get(hw, 3)
        nds = [nodes.get(int(r.get("ref"))) for r in w.findall("nd")]
        pts = [p for p in nds if p]
        if len(pts) < 2:
            continue
        st = {
            "c": cls,
            "w": WIDTHS[cls],
            "p": [c for pt in pts for c in pt],   # flat [x,y,x,y,...]
        }
        name = tags.get("name")
        if name:
            st["n"] = name[:48]
        ms = tags.get("maxspeed")
        if ms and ms.isdigit():
            st["s"] = int(ms)
            maxspeeds.append(int(ms))
        streets.append(st)
    if not streets:
        return None
    xs = [p[0] for st in streets for p in zip(st["p"][::2], st["p"][1::2])]
    ys = [p[1] for st in streets for p in zip(st["p"][::2], st["p"][1::2])]
    return {
        "name": area_name,
        "bb": [min(xs), min(ys), max(xs), max(ys)],
        "streets": streets,
    }


def main():
    areas = []
    label = {
        "gateway_of_india_mumbai.osm": "Gateway of India / Colaba-Fort",
        "colabamumbaiindia.osm": "Colaba (dense network)",
        "colaba_mumbai_india.osm": "Colaba (core)",
        "marine_drivemumbaiindia.osm": "Marine Drive / Churchgate belt",
        "bkcmumbaiindia.osm": "Bandra Kurla Complex",
        "borivali_mumbai_india.osm": "Borivali",
        "kapurbawdi_thane_india.osm": "Thane (Kapurbawdi)",
    }
    for f in sorted(os.listdir(SRC)):
        if not f.endswith(".osm"):
            continue
        a = parse_file(os.path.join(SRC, f), label.get(f, f))
        if a:
            areas.append(a)
            print(f"{a['name']}: {len(a['streets'])} streets, bbox {a['bb']}")
    total = sum(len(a["streets"]) for a in areas)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    meta = {
        "anchor": [ANCHOR_LO, ANCHOR_LA],
        "credit": "(c) OpenStreetMap contributors, ODbL 1.0 — real street network, key areas",
        "areas": areas,
    }
    js = "const REAL_STREETS=" + json.dumps(meta, separators=(",", ":")) + ";\n"
    with open(OUT, "w", encoding="utf-8") as fh:
        fh.write(js)
    print(f"TOTAL: {len(areas)} areas, {total} real streets -> {OUT} ({len(js)/1024:.0f} KB)")


if __name__ == "__main__":
    main()
