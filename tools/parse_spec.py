#!/usr/bin/env python3
"""Parse the Mumbai-Navi Mumbai IslandGame prompt spec (780 location dossiers)
into a compact JS location database used by the game.

Every field below is extracted verbatim from the spec so the game honors the
document's own text: position, atmospheric moment, landmark, NPC figure,
community, soundscape, smellscape, signature drama, traffic, wildlife.
"""
import re, json, sys, io

SPEC = "_spec/Mumbai_NaviMumbai_IslandGame_Prompt.txt"

REGION_LABELS = {
    "south mumbai":     "South Mumbai - Island City",
    "western suburbs":  "Western Suburbs",
    "eastern suburbs":  "Eastern Suburbs & Harbour",
    "thane":            "Thane & Creek Fringe",
    "bhiwandi kalyan":  "Bhiwandi & Kalyan Belt",
    "vasai virar":      "Vasai-Virar",
    "navi mumbai core": "Navi Mumbai Core",
    "kharghar panvel":  "Kharghar & Panvel",
    "uran jnpt":        "Uran & JNPT Port",
    "raigad fringe":    "Raigad Fringe",
}

def clean(s):
    return re.sub(r"\s+", " ", s or "").strip()

def parse():
    text = io.open(SPEC, encoding="utf-8").read()
    # dossier blocks start at each "LOCATION DOSSIER:" header line
    parts = re.split(r"LOCATION DOSSIER:\s*", text)
    pois = []
    missing_coord = 0
    for block in parts[1:]:
        head, _, body = block.partition("=" * 80)
        m = re.match(r"(.+?)\s*\(([^)]*)\)", head.strip())
        if not m:
            continue
        name = clean(m.group(1))
        region = clean(m.group(2)).lower()
        b = body
        lat = re.search(r"approximately\s+(-?[\d.]+)\s+degrees north latitude", b)
        lon = re.search(r"(-?[\d.]+)\s+degrees east longitude", b)
        elev = re.search(r"elevation of about\s+(-?[\d.]+)\s+metres", b)
        if not (lat and lon):
            missing_coord += 1
            continue
        la, lo = float(lat.group(1)), float(lon.group(1))
        if not (17.5 < la < 21.0 and 71.5 < lo < 74.5):
            missing_coord += 1
            continue
        p = {"n": name, "r": region, "la": round(la, 4), "lo": round(lo, 4)}
        if elev:
            p["el"] = round(float(elev.group(1)), 1)
        def grab(pat, key, flags=0, default=None):
            mm = re.search(pat.format(re.escape(name)), b, flags)
            if mm:
                v = clean(mm.group(1))
                if v:
                    p[key] = v[:220]
            elif default:
                p[key] = default
        grab(r"The character of .*? is shaped by its position:\s*(.+)", "pos")
        grab(r"with ([^.]+?) as the dominant ground cover", "cover")
        grab(r"as the dominant ground cover and ([^.]+?) forming the typical structural palette", "palette")
        grab(r"A typical atmospheric moment here is\s+([^.]+)\.", "moment")
        grab(r"Anchoring the public realm of .*? is\s+([^.]+)\.", "landmark")
        grab(r"A typical figure one meets is\s+([^.]+)\.", "figure")
        grab(r"dominated by\s+([^.]+?) colonies", "community")
        grab(r"the ear receives\s+(.+?);\s*the nose meets\s", "sounds")
        grab(r"the nose meets\s+(.+?)\.\s", "smells")
        grab(r"The signature drama of .*? is water:\s*([^.]+)\.", "drama")
        grab(r"The road life of .*? is a choreography of\s+([^.]+)\.", "traffic")
        grab(r"mangroves - ([^.]+)\.", "wildlife")
        pois.append(p)
    return pois, missing_coord

def categorize(p):
    n = p["n"].lower()
    def has(*words): return any(w in n for w in words)
    if has("airport", "aerodrome", "air force"): return "airport"
    if has("station", "terminus", "railway", "metro"): return "rail"
    if has("beach", "chowpatty", "shore", "coast"): return "beach"
    if has("fort", "cave", "bastion"): return "fort"
    if has("port", "harbour", "harbor", "jnpt", "dock", "pier", "jetty", "wharf"): return "port"
    if has("island", " bet"): return "island"
    if has("lake", "talao", "tank"): return "lake"
    if has("dam", "reservoir"): return "dam"
    if has("creek", "river", "estuary"): return "water"
    if has("hill", "sanctuary", "national park", "forest", "park", "garden", "mangrove"): return "nature"
    if has("market", "mall", "bazaar", "market", "apmc"): return "market"
    if has("temple", "mandir", "mosque", "dargah", "church", "masjid", "gurudwara", "stupa", "shrine"): return "temple"
    if has("stadium", "ground", "club", "racecourse"): return "stadium"
    if has("university", "college", "campus", "school", "institute", "vidyanagari"): return "campus"
    if has("helipad", "heliport"): return "heliport"
    if has("bridge", "sea link", "flyover", "viaduct", "causeway"): return "bridge"
    if has("power", "thermal", "refinery", "plant", "factory", "midc", "industrial", "godown", "warehouse", "loom"): return "industry"
    if has("village", "koliwada", "gaon", "wadi", "pada", "nagar", "colony"): return "locality"
    return "locality"

def main():
    pois, missing = parse()
    for p in pois:
        p["c"] = categorize(p)
    with io.open("game/src/gen/pois.js", "w", encoding="utf-8") as f:
        f.write("// GENERATED from Mumbai_NaviMumbai_IslandGame_Prompt.txt (780 location dossiers)\n")
        f.write("// Every entry: n=name r=region la/lo=WGS84 el=elev(m) c=category + spec flavor fields\n")
        f.write("const POIS=")
        f.write(json.dumps(pois, ensure_ascii=False, separators=(",", ":")))
        f.write(";\n")
    # stats
    from collections import Counter
    regions = Counter(p["r"] for p in pois)
    cats = Counter(p["c"] for p in pois)
    print("parsed:", len(pois), "dossiers; missing/bad coords:", missing)
    print("regions:", dict(regions))
    print("categories:", dict(cats))
    with_flavor = sum(1 for p in pois if "moment" in p)
    print("with flavor fields:", with_flavor)

if __name__ == "__main__":
    main()
