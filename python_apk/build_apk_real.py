#!/usr/bin/env python3
"""v3.0 APK build — REBUILT ON REAL ANDROID TOOLS.

The v1..v2.3 APKs were fully hand-built (manifest, arsc, zip) and only ever
checked by lenient third-party parsers; the user's phone ("problem parsing
package" on every version) runs Google's real package parser. This build
replaces the hand-rolled parts with the genuine toolchain:

  - aapt2 (Google binary, android/tools/aapt2) compiles res/ and links the
    text manifest into the REAL binary AndroidManifest.xml + resources.arsc
  - dx (real Android dx, android/tools/dx_ta.jar) compiles the java
  - zip written with zipalign-style 4-byte alignment for stored entries
  - signing: v1 JAR (openssl-verified) + APK Signature Scheme v2
    (apksigtool-verified), persistent key
  - validation includes `aapt2 dump badging` — Google's own parser — plus
    pyaxmlparser/androguard/apksigtool/openssl/digest-chain gates
"""
import os
import struct
import subprocess
import sys
import zipfile
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "python_apk"))

import build_apk as old  # reuse: compile_java, make_cert, jar_manifest, sf_file, pkcs7_sign, add_v2_signature, validate_dex_callsites

AAPT2 = os.path.join(ROOT, "android", "tools", "aapt2")
AJAR = os.path.join(ROOT, "android", "tools", "android-25.jar")
PKG = os.path.join(ROOT, "android", "pkg")
OUT = os.path.join(ROOT, "dist", "IslandRealm-Mumbai-debug.apk")

STORED = {  # aapt2 convention: uncompressed, aligned
    "resources.arsc",
}


def real_resources():
    tmp_res = "/tmp/v3_res.zip"
    tmp_base = "/tmp/v3_base.apk"
    subprocess.run([AAPT2, "compile", "--dir", os.path.join(PKG, "res"), "-o", tmp_res],
                   check=True)
    subprocess.run([AAPT2, "link", "-o", tmp_base, "-I", AJAR,
                    "--manifest", os.path.join(PKG, "AndroidManifest.xml"),
                    "--min-sdk-version", "21", "--target-sdk-version", "29",
                    tmp_res], check=True)
    out = {}
    with zipfile.ZipFile(tmp_base) as z:
        for n in z.namelist():
            out[n] = z.read(n)
    assert "AndroidManifest.xml" in out and "resources.arsc" in out
    print("  aapt2 compile+link ok:", ", ".join(sorted(out)))
    return out


def write_aligned_zip(path, files):
    """files: [(name, data, method)] written zipalign-style (4-byte data
    alignment for stored entries, extra-field padding, EOCD last 22 bytes)."""
    buf = bytearray()
    central = []

    def u16(x):
        return struct.pack("<H", x)

    def u32(x):
        return struct.pack("<I", x)

    for name, data, method in files:
        nb = name.encode("utf-8")
        crc = zlib.crc32(data) & 0xFFFFFFFF
        if method == zipfile.ZIP_STORED:
            cdata = data
        else:
            co = zlib.compressobj(6, zlib.DEFLATED, -15)
            cdata = co.compress(data) + co.flush()
        off = len(buf)
        # local header (30) + name + extra; pad extra so DATA starts %4==0 for stored
        elen = 0
        if method == zipfile.ZIP_STORED:
            elen = (4 - ((off + 30 + len(nb)) % 4)) % 4
        hdr = (b"PK\x03\x04" + u16(20) + u16(0) + u16(method) + u16(0) + u16(0)
               + u32(crc) + u32(len(cdata)) + u32(len(data)) + u16(len(nb)) + u16(elen))
        buf += hdr + nb + b"\x00" * elen + cdata
        central.append((nb, off, crc, len(cdata), len(data), method, elen))

    cd_start = len(buf)
    for nb, off, crc, csz, usz, method, elen in central:
        buf += (b"PK\x01\x02" + u16(20) + u16(20) + u16(0) + u16(method) + u16(0)
                + u16(0) + u32(crc) + u32(csz) + u32(usz) + u16(len(nb)) + u16(0)
                + u16(0) + u16(0) + u16(0) + u32(0) + u32(off)) + nb
    cd_len = len(buf) - cd_start
    buf += (b"PK\x05\x06" + u16(0) + u16(0) + u16(len(central)) + u16(len(central))
            + u32(cd_len) + u32(cd_start) + u16(0))
    open(path, "wb").write(bytes(buf))


def main():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)

    print("[1/5] dex (real dx + descriptor-exact stubs)")
    dex = old.compile_java()
    old.validate_dex_callsites(dex)

    print("[2/5] aapt2: real manifest + resources")
    res = real_resources()

    print("[3/5] assemble aligned zip")
    payload = [("AndroidManifest.xml", res["AndroidManifest.xml"], zipfile.ZIP_DEFLATED),
               ("classes.dex", dex, zipfile.ZIP_DEFLATED),
               ("assets/index.html", open(os.path.join(ROOT, "www/index.html"), "rb").read(), zipfile.ZIP_DEFLATED),
               ("assets/vendor/three.min.js", open(os.path.join(ROOT, "www/vendor/three.min.js"), "rb").read(), zipfile.ZIP_DEFLATED),
               ("assets/data/streets_real.js", open(os.path.join(ROOT, "www/data/streets_real.js"), "rb").read(), zipfile.ZIP_DEFLATED),
               ("assets/data/dem.js", open(os.path.join(ROOT, "www/data/dem.js"), "rb").read(), zipfile.ZIP_DEFLATED),
               ("assets/data/buildings_real.js", open(os.path.join(ROOT, "www/data/buildings_real.js"), "rb").read(), zipfile.ZIP_DEFLATED)]
    for n, b in sorted(res.items()):
        if n in ("AndroidManifest.xml", "resources.arsc"):
            continue
        payload.append((n, b, zipfile.ZIP_STORED))
    payload.append(("resources.arsc", res["resources.arsc"], zipfile.ZIP_STORED))
    assert len({n for n, _, _ in payload}) == len(payload), "duplicate zip entries"
    tmp_apk = "/tmp/v3_unsigned.apk"
    write_aligned_zip(tmp_apk, payload)

    print("[4/5] sign v1 + v2 (persistent key)")
    manifest_bytes, sections = old.jar_manifest([(n, d) for n, d, _ in payload])
    sf = old.sf_file(manifest_bytes, sections)
    key, cert = old.make_cert()
    p7 = old.pkcs7_sign(sf, key, cert)
    meta = [("META-INF/MANIFEST.MF", manifest_bytes, zipfile.ZIP_STORED),
            ("META-INF/CERT.SF", sf, zipfile.ZIP_STORED),
            ("META-INF/CERT.RSA", p7, zipfile.ZIP_STORED)]
    write_aligned_zip(OUT, payload + meta)
    blen = old.add_v2_signature(OUT, key, cert)
    print(f"  signed: {OUT} ({os.path.getsize(OUT)} bytes, v2 block {blen} B)")

    print("[5/5] validation")
    r = subprocess.run([AAPT2, "dump", "badging", OUT], capture_output=True, text=True)
    bad = r.stdout.splitlines()
    assert any("package: name='com.arena.islandrealm'" in l and "versionCode='17'" in l for l in bad), "aapt2 badging: package line missing"
    assert any("application-label:" in l for l in bad), "aapt2 badging: label missing"
    assert any("launchable-activity" in l for l in bad), "aapt2 badging: launchable activity missing"
    print("   aapt2 badging (REAL parser): OK")
    for l in bad[:4]:
        print("     " + l)

    # required files physically present
    with zipfile.ZipFile(OUT) as z:
        names = set(z.namelist())
        for req in ["assets/index.html", "assets/vendor/three.min.js", "assets/data/streets_real.js",
                    "assets/data/dem.js", "assets/data/buildings_real.js", "resources.arsc",
                    "classes.dex", "META-INF/MANIFEST.MF", "META-INF/CERT.SF", "META-INF/CERT.RSA"]:
            assert req in names, "MISSING: " + req
        print("   zip entries ok:", len(names))

    # v1 CMS verify (openssl) + digest chain
    with zipfile.ZipFile(OUT) as z:
        sf_b = z.read("META-INF/CERT.SF")
        p7_b = z.read("META-INF/CERT.RSA")
        mf_b = z.read("META-INF/MANIFEST.MF")
    import tempfile
    with tempfile.TemporaryDirectory() as td:
        p1 = os.path.join(td, "sf")
        p2 = os.path.join(td, "rsa")
        open(p1, "wb").write(sf_b)
        open(p2, "wb").write(p7_b)
        r = subprocess.run(["openssl", "smime", "-verify", "-noverify", "-inform", "DER",
                            "-content", p1, "-in", p2], capture_output=True, text=True)
        assert "Verification successful" in r.stderr, r.stderr
        print("   openssl v1 CMS: verified")
    import hashlib, base64
    mf_txt = mf_b.decode()
    with zipfile.ZipFile(OUT) as z:
        for name in [n for n, _, _ in payload]:
            want = base64.b64encode(hashlib.sha256(z.read(name)).digest()).decode()
            sect = mf_txt.split("Name: " + name + "\r\n")[1].split("\r\n\r\n")[0]
            got = [l.split(": ", 1)[1] for l in sect.split("\r\n") if l.startswith("SHA-256-Digest:")][0]
            assert want == got, "digest mismatch: " + name
    print("   jar digest chain: verified")

    # v2 via apksigtool
    r = subprocess.run(["apksigtool", "parse", OUT], capture_output=True, text=True)
    assert "VERIFIED" in r.stdout, r.stdout[-500:] + r.stderr[-300:]
    print("   apksigtool v2: VERIFIED")

    # pyaxmlparser + androguard (lenient cross-checks)
    from pyaxmlparser import APK
    apk = APK(OUT)
    print("   pyaxmlparser:", apk.package, apk.version_code, apk.version_name)
    assert apk.package == "com.arena.islandrealm" and str(apk.version_name) == "4.1"
    print()
    print("APK BUILD COMPLETE (REAL TOOLCHAIN):", OUT, os.path.getsize(OUT), "bytes")


if __name__ == "__main__":
    main()
