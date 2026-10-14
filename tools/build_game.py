#!/usr/bin/env python3
"""Bundle game sources into a single-file www/index.html (APK-ready, offline)."""
import io, os, re

SRC = "game/src"
TPL = "game/index.template.html"
OUT = "www/index.html"

FILES = [
    "00_boot.js", "01_geo.js", "gen/pois.js", "03_core.js", "04_camera_input.js",
    "05_weather.js", "06_render.js", "07_vehicles.js", "08_traffic.js",
    "09_npcs.js", "11_map_ui.js", "12_ui.js", "13_audio.js", "14_main.js",
]

def main():
    parts = []
    for f in FILES:
        p = os.path.join(SRC, f)
        parts.append(f"/* ===== {f} ===== */\n" + io.open(p, encoding="utf-8").read())
    js = "\n".join(parts)
    tpl = io.open(TPL, encoding="utf-8").read()
    assert "/*__GAME_SCRIPT__*/" in tpl
    html = tpl.replace("/*__GAME_SCRIPT__*/", js.replace("</script>", "<\\/script>"))
    os.makedirs("www", exist_ok=True)
    io.open(OUT, "w", encoding="utf-8").write(html)
    print(f"bundled {len(FILES)} files -> {OUT} ({len(html)/1024:.0f} KB)")

if __name__ == "__main__":
    main()
