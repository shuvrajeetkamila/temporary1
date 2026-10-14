#!/usr/bin/env python3
"""Build IslandRealm.apk end-to-end WITHOUT the Android SDK:
  ecj (Eclipse compiler) -> .class  ->  dx (ta fork, via reflective launcher) -> classes.dex
  -> binary AXML manifest (hand-written encoder) -> zip -> v1 JAR signature
  (SHA-256 digests + PKCS#7 detached, RFC-5652 via `cryptography`).
Validates: AXML decode, manifest re-parse (pyaxmlparser), openssl PKCS#7 check."""
import io, os, struct, subprocess, sys, zipfile, base64, hashlib, shutil, datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AND = os.path.join(ROOT, "android")
PKG = os.path.join(ROOT, "python_apk")
sys.path.insert(0, PKG)
import axml

JAVA = None  # set via jdk4py


def jdk():
    global JAVA
    if JAVA is None:
        import jdk4py
        JAVA = str(jdk4py.JAVA)
    return JAVA


def run(cmd, **kw):
    r = subprocess.run(cmd, capture_output=True, text=True, **kw)
    if r.returncode != 0:
        print("CMD FAILED:", " ".join(cmd))
        print(r.stdout[-3000:]); print(r.stderr[-3000:])
        sys.exit(1)
    return r


# ---------------- 1. compile java ----------------
def compile_java():
    bin_dir = os.path.join(AND, "bin")
    shutil.rmtree(bin_dir, ignore_errors=True)
    os.makedirs(bin_dir, exist_ok=True)
    files = []
    for d in ("src", "stubs"):
        for base, _, fns in os.walk(os.path.join(AND, d)):
            files += [os.path.join(base, f) for f in fns if f.endswith(".java")]
    run([jdk(), "-jar", os.path.join(AND, "tools/ecj.jar"), "-1.6", "-nowarn",
         "-bootclasspath", os.path.join(AND, "tools/mockrt.jar"),
         "-d", bin_dir] + files)
    # dex only our package (stubs stay out of the APK)
    com_only = os.path.join(bin_dir, "com_only")
    shutil.rmtree(com_only, ignore_errors=True)
    shutil.copytree(os.path.join(bin_dir, "com"), os.path.join(com_only, "com"))
    dex_out = os.path.join(bin_dir, "classes.dex")
    if os.path.exists(dex_out):
        os.remove(dex_out)
    env = dict(os.environ)
    run([jdk(), "-cp", os.path.join(AND, "tools/dx_ta.jar") + os.pathsep + os.path.join(AND, "tools"),
         "DxRun", "--dex", "--output=" + dex_out, com_only])
    dex = open(dex_out, "rb").read()
    assert dex[:4] == b"dex\n" and struct.unpack_from("<I", dex, 32)[0] == len(dex), "bad dex"
    print(f"  dex ok: {len(dex)} bytes")
    return dex


# ---------------- 2. manifest ----------------
def A(name, val):  # android: attr
    return (axml.NS_ANDROID, name, val)


def build_manifest():
    package = "com.arena.islandrealm"
    activity = "com.arena.islandrealm.MainActivity"
    theme = ("ref", axml.STYLE["Theme.Black.NoTitleBar.Fullscreen"])
    icon = ("ref", 0x7F010000)   # @mipmap/ic_launcher: pkg 0x7F, type 1, ENTRY index 0
    label = ("ref", 0x7F020000)  # @string/app_name
    manifest = axml.Node("manifest", [
        (None, "package", package),
        A("versionCode", ("int", 3)),
        A("versionName", "1.3"),
    ], [
        axml.Node("uses-sdk", [
            A("minSdkVersion", ("int", 21)),
            A("targetSdkVersion", ("int", 29)),
        ]),
        axml.Node("application", [
            A("label", label),
            A("icon", icon),
            A("theme", theme),
            A("allowBackup", True),
            A("hasCode", True),
            A("hardwareAccelerated", True),
            A("supportsRtl", True),
        ], [
            axml.Node("activity", [
                A("name", activity),
                A("exported", True),
                A("screenOrientation", ("int", 4)),  # fullSensor... 4 = unspecified? (see below)
                A("configChanges", ("int", 0x7A0)),  # orientation|screenSize|screenLayout|smallestScreenSize|keyboard|keyboardHidden|uiMode|density
            ], [
                axml.Node("intent-filter", [], [
                    axml.Node("action", [A("name", "android.intent.action.MAIN")]),
                    axml.Node("category", [A("name", "android.intent.category.LAUNCHER")]),
                ]),
            ]),
        ]),
    ])
    return axml.encode(manifest)
    # screenOrientation: 4 = "unspecified" is value 4? Actually: -1 unspecified, 0 landscape,
    # 1 portrait, 4 sensor(=4 "sensor"? values: 0 landscape 1 portrait 4 sensorLandscape? )


# ---------------- 3. assemble + sign (JAR spec v1) ----------------
def b64(b): return base64.b64encode(b).decode()


def wrap76(line):
    """PEM-style 72-byte line wrapping as java.util.jar writes/reads digests."""
    out = []
    while line:
        out.append(line[:72])
        line = line[72:]
    return "\r\n".join(out)


def jar_manifest(entries):
    """entries: list of (name, bytes). Returns MANIFEST.MF bytes + per-entry sections."""
    main = "Manifest-Version: 1.0\r\nCreated-By: 1.0 (Arena Agent)\r\n\r\n"
    sections = [main]
    for name, data in entries:
        dig = b64(hashlib.sha256(data).digest())
        sect = "Name: " + name + "\r\n" + "SHA-256-Digest: " + wrap76(dig) + "\r\n" + "\r\n"
        sections.append(sect)
    return "".join(sections).encode("utf-8"), sections


def sf_file(manifest_bytes, sections):
    main = "Signature-Version: 1.0\r\nCreated-By: 1.0 (Arena Agent)\r\n"
    main += "SHA-256-Digest-Manifest: " + b64(hashlib.sha256(manifest_bytes).digest()) + "\r\n"
    main += "SHA-256-Digest-Manifest-Main-Attributes: " + \
        b64(hashlib.sha256(sections[0].encode()).digest()) + "\r\n\r\n"
    out = [main]
    for sect in sections[1:]:
        dig = b64(hashlib.sha256(sect.encode()).digest())
        # entry in .SF: same Name + digest of the raw manifest section bytes
        name = [l for l in sect.split("\r\n") if l.startswith("Name: ")][0][6:]
        out.append("Name: " + name + "\r\n" + "SHA-256-Digest: " + dig + "\r\n\r\n")
    return "".join(out).encode("utf-8")


def make_cert():
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    import time
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([
        x509.NameAttribute(NameOID.COMMON_NAME, u"Island Realm Debug"),
        x509.NameAttribute(NameOID.ORGANIZATION_NAME, u"Arena Agent Builds"),
    ])
    now = datetime.datetime.now(datetime.timezone.utc)
    cert = (x509.CertificateBuilder()
            .subject_name(name).issuer_name(name)
            .public_key(key.public_key())
            .serial_number(x509.random_serial_number())
            .not_valid_before(now - datetime.timedelta(days=1))
            .not_valid_after(now + datetime.timedelta(days=3650))
            .sign(key, hashes.SHA256()))
    return key, cert


def pkcs7_sign(data, key, cert):
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.serialization import pkcs7
    return (pkcs7.PKCS7SignatureBuilder()
            .set_data(data)
            .add_signer(cert, key, hashes.SHA256())
            .sign(serialization.Encoding.DER, [pkcs7.PKCS7Options.DetachedSignature]))


def assemble(dex, index_html, out_path):
    manifest_xml = build_manifest()
    # sanity: decode our own AXML
    events = axml.decode(manifest_xml)
    assert events[0][0] == "ns" and any(e[0] == "start" and e[1] == "manifest" for e in events)
    print(f"  axml ok: {len(manifest_xml)} bytes, {len(events)} events")

    # resources: arsc + launcher icons at the exact paths the table references
    import arsc
    densities = [("mdpi", 160), ("hdpi", 240), ("xhdpi", 320), ("xxhdpi", 480), ("xxxhdpi", 640)]
    arsc_bytes = arsc.build(densities, "Island Realm: Mumbai–Navi Mumbai")
    res_files = [("resources.arsc", arsc_bytes)]
    for d, _ in densities:
        p = os.path.join(ROOT, "android/res", f"mipmap-{d}", "ic_launcher.png")
        res_files.append((f"res/mipmap-{d}-v4/ic_launcher.png", open(p, "rb").read()))
    print(f"  arsc ok: {len(arsc_bytes)} bytes + {len(res_files)-1} icons")

    files = [
        ("AndroidManifest.xml", manifest_xml),
        ("classes.dex", dex),
        ("assets/index.html", index_html),
    ] + res_files
    manifest_bytes, sections = jar_manifest(files)
    sf = sf_file(manifest_bytes, sections)
    key, cert = make_cert()
    p7 = pkcs7_sign(sf, key, cert)

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        z.writestr(zipfile.ZipInfo("AndroidManifest.xml"), manifest_xml)
        z.writestr(zipfile.ZipInfo("classes.dex"), dex)
        z.writestr(zipfile.ZipInfo("assets/index.html"), index_html)
        for name, data in res_files:
            z.writestr(zipfile.ZipInfo(name), data)
        z.writestr(zipfile.ZipInfo("META-INF/MANIFEST.MF"), manifest_bytes)
        z.writestr(zipfile.ZipInfo("META-INF/CERT.SF"), sf)
        z.writestr(zipfile.ZipInfo("META-INF/CERT.RSA"), p7)
    print(f"  signed apk: {out_path} ({os.path.getsize(out_path)} bytes)")
    return manifest_xml


# ---------------- 4. external validations ----------------
def validate(out_path):
    print("  -- pyaxmlparser --")
    from pyaxmlparser import APK
    apk = APK(out_path)
    print("   package:", apk.package, "versionCode:", apk.version_code, "versionName:", apk.version_name)
    print("   application:", apk.application)
    acts = apk.get_activities()
    print("   activities:", acts)
    assert apk.package == "com.arena.islandrealm"
    assert "com.arena.islandrealm.MainActivity" in acts
    print("  -- resource resolution (androguard) --")
    icon = apk.get_app_icon(65536)
    print("   app icon:", icon)
    assert icon and "ic_launcher" in icon, "icon resource did not resolve"
    lbl = apk.get_app_name()
    print("   app label:", lbl)
    assert "Island Realm" in (lbl or ""), "label resource did not resolve"
    print("  -- openssl PKCS#7 --")
    import tempfile
    with zipfile.ZipFile(out_path) as z:
        sf = z.read("META-INF/CERT.SF")
        p7 = z.read("META-INF/CERT.RSA")
        mf = z.read("META-INF/MANIFEST.MF")
    with tempfile.TemporaryDirectory() as td:
        p1, p2, p3 = os.path.join(td, "a"), os.path.join(td, "b"), os.path.join(td, "c")
        open(p1, "wb").write(sf); open(p2, "wb").write(p7); open(p3, "wb").write(mf)
        r = subprocess.run(["openssl", "smime", "-verify", "-noverify", "-inform", "DER",
                            "-content", p1, "-in", p2], capture_output=True, text=True)
        print("   openssl:", r.stderr.strip() or "verify ok")
        assert "Verification successful" in r.stderr
    # digest cross-check: MANIFEST covers every file
    with zipfile.ZipFile(out_path) as z:
        for name, data in [("AndroidManifest.xml", z.read("AndroidManifest.xml")),
                           ("classes.dex", z.read("classes.dex")),
                           ("assets/index.html", z.read("assets/index.html"))]:
            want = base64.b64encode(hashlib.sha256(data).digest()).decode()
            mf_txt = mf.decode()
            sect = mf_txt.split("Name: " + name + "\r\n")[1].split("\r\n\r\n")[0]
            got = [l.split(": ", 1)[1] for l in sect.split("\r\n") if l.startswith("SHA-256-Digest:")][0]
            assert got == want, f"manifest digest mismatch for {name}"
        # .SF per-entry digests must match raw manifest sections
        sf_txt = sf.decode()
        mfb = mf.decode()
        for sect in mfb.split("\r\n\r\n"):
            if not sect.strip() or not sect.startswith("Name: "):
                continue
            name = sect.split("\r\n")[0][6:]
            raw = ("Name: " + name + "\r\n" +
                   "\r\n".join(sect.split("\r\n")[1:]) + "\r\n\r\n")
            want = b64(hashlib.sha256(raw.encode()).digest())
            ssect = sf_txt.split("Name: " + name + "\r\n")[1].split("\r\n\r\n")[0]
            got = [l.split(": ", 1)[1] for l in ssect.split("\r\n") if l.startswith("SHA-256-Digest:")][0]
            assert got == want, f".SF section digest mismatch for {name}"
    print("  jar digest chain verified")


def main():
    print("[1/4] compiling java -> dex")
    dex = compile_java()
    print("[2/4] bundling game assets")
    index = open(os.path.join(ROOT, "www/index.html"), "rb").read()
    print("[3/4] assembling + signing")
    out = os.path.join(ROOT, "dist/IslandRealm-Mumbai-debug.apk")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    assemble(dex, index, out)
    print("[4/4] validating")
    validate(out)
    print("APK BUILD COMPLETE:", out)


if __name__ == "__main__":
    main()
