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
    validate_dex_callsites(dex)
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
        A("versionCode", ("int", 13)),
        A("versionName", "2.3"),
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


KEY_PATH = os.path.join(ROOT, "android", "keystore", "signing_key.pem")
CERT_PATH = os.path.join(ROOT, "android", "keystore", "signing_cert.pem")


def make_cert():
    """Stable project identity: reuse the same key for every build so updates
    install OVER previous versions (Android refuses signature mismatches)."""
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    import time
    if os.path.exists(KEY_PATH) and os.path.exists(CERT_PATH):
        key = serialization.load_pem_private_key(open(KEY_PATH, "rb").read(), password=None)
        cert = x509.load_pem_x509_certificate(open(CERT_PATH, "rb").read())
        return key, cert
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
    os.makedirs(os.path.dirname(KEY_PATH), exist_ok=True)
    open(KEY_PATH, "wb").write(key.private_bytes(serialization.Encoding.PEM,
                                                  serialization.PrivateFormat.PKCS8,
                                                  serialization.NoEncryption()))
    open(CERT_PATH, "wb").write(cert.public_bytes(serialization.Encoding.PEM))
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
        ("assets/vendor/three.min.js", open(os.path.join(ROOT, "www/vendor/three.min.js"), "rb").read()),
        ("assets/data/streets_real.js", open(os.path.join(ROOT, "www/data/streets_real.js"), "rb").read()),
        ("assets/data/dem.js", open(os.path.join(ROOT, "www/data/dem.js"), "rb").read()),
        ("assets/data/buildings_real.js", open(os.path.join(ROOT, "www/data/buildings_real.js"), "rb").read()),
    ] + res_files
    manifest_bytes, sections = jar_manifest(files)
    sf = sf_file(manifest_bytes, sections)
    key, cert = make_cert()
    p7 = pkcs7_sign(sf, key, cert)

    with zipfile.ZipFile(out_path, "w", zipfile.ZIP_DEFLATED, compresslevel=6) as z:
        # write EVERY signed entry (assets included — they were silently
        # dropped before v2.1, leaving the world without its 3D engine/data)
        for name, data in files:
            zi = zipfile.ZipInfo(name)
            zi.compress_type = zipfile.ZIP_STORED if name.endswith(".arsc") else zipfile.ZIP_DEFLATED
            zi.external_attr = 0o644 << 16
            z.writestr(zi, data)
        z.writestr(zipfile.ZipInfo("META-INF/MANIFEST.MF"), manifest_bytes)
        z.writestr(zipfile.ZipInfo("META-INF/CERT.SF"), sf)
        z.writestr(zipfile.ZipInfo("META-INF/CERT.RSA"), p7)
    blen = add_v2_signature(out_path, key, cert)
    print(f"  signed apk: {out_path} ({os.path.getsize(out_path)} bytes, v2 block {blen} B + v1)")
    return manifest_xml


# ---------------- 3b. APK Signature Scheme v2 (Android 7+ install path) ----------------
V2_BLOCK_ID = 0x7109871A
V2_ALGO_RSA_PKCS1_SHA256_CHUNKED = 0x0103
MAGIC = b"APK Sig Block 42"


def _lp(b):
    return len(b).to_bytes(4, "little") + b


def _u32(x):
    return x.to_bytes(4, "little")


def _u64(x):
    return x.to_bytes(8, "little")


def _chunk_digest(chunk, hasher):
    return hasher(b"\xa5" + _u32(len(chunk)) + chunk).digest()


def _apk_content_digests(data, sb_offset, sb_len, hasher):
    """Digests over: entries region | central directory | EOCD (cd field -> sb_offset)."""
    # locate EOCD ourselves (no zip64 in our APKs)
    eocd_off = data.rfind(b"PK\x05\x06")
    assert eocd_off != -1
    cd_off = int.from_bytes(data[eocd_off + 16:eocd_off + 20], "little")
    assert cd_off == sb_offset, "signing block must be inserted at the CD offset"
    digests = []
    def feed(buf):
        for i in range(0, len(buf), 1048576):
            digests.append(_chunk_digest(buf[i:i + 1048576], hasher))
    feed(data[:cd_off])                       # 1) zip entries region
    feed(data[cd_off:eocd_off])               # 2) central directory (original bytes)
    eocd = bytearray(data[eocd_off:])         # 3) EOCD with cd_offset field = sb_offset
    eocd[16:20] = _u32(sb_offset)
    feed(bytes(eocd))
    top = hasher(b"\x5a" + _u32(len(digests)) + b"".join(digests)).digest()
    return top, cd_off, eocd_off


def add_v2_signature(out_path, key, cert):
    """Insert a valid v2 signing block before the central directory, in place."""
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding
    import hashlib
    data = open(out_path, "rb").read()

    algo = V2_ALGO_RSA_PKCS1_SHA256_CHUNKED
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    pub_spki = cert.public_key().public_bytes(
        serialization.Encoding.DER, serialization.PublicFormat.SubjectPublicKeyInfo)

    def make_fields(digest32, sig_bytes):
        # digest record = lenPrefix(u32 algo | lenPrefix(digest)); section = lenPrefix(records)
        digest_rec = _u32(algo) + _lp(digest32)
        digests_sec = _lp(_lp(digest_rec))
        sig_rec = _u32(algo) + _lp(sig_bytes)
        sigs_sec = _lp(_lp(sig_rec))
        # signed data = digests section | certificates section | attributes section
        signed_data = digests_sec + _lp(_lp(cert_der)) + _lp(b"")
        return signed_data, sig_rec, sigs_sec

    def build_block(digest32, sig_placeholder_len):
        signed_data, sig_rec, sigs_sec = make_fields(digest32, b"\x00" * sig_placeholder_len)
        signer_fields = _lp(signed_data) + sigs_sec + _lp(pub_spki)
        v2_val = _lp(_lp(signer_fields))  # sequence prefix + signer-record prefix + fields
        pair = _u64(4 + len(v2_val)) + _u32(V2_BLOCK_ID) + v2_val
        body = pair
        size = len(body) + 8 + 16
        return _u64(size) + body + _u64(size) + MAGIC

    # pass 1: placeholder digest + placeholder sig -> fixes block length
    probe = build_block(b"\x00" * 32, 256)
    sb_offset = data.rfind(b"PK\x05\x06")
    eocd_off0 = sb_offset
    cd_off0 = int.from_bytes(data[eocd_off0 + 16:eocd_off0 + 20], "little")
    top, _, _ = _apk_content_digests(data, cd_off0, len(probe), hashlib.sha256)
    block = build_block(top, 256)

    # sign the exact signed-data bytes (rebuilt identically with the real digest)
    signed_data, _, _ = make_fields(top, b"\x00" * 256)
    signature = key.sign(signed_data, padding.PKCS1v15(), hashes.SHA256())
    _, sig_rec, sigs_sec = make_fields(top, signature)
    signer_fields = _lp(signed_data) + sigs_sec + _lp(pub_spki)
    v2_val = _lp(_lp(signer_fields))    # sequence prefix + signer-record prefix + fields
    pair = _u64(4 + len(v2_val)) + _u32(V2_BLOCK_ID) + v2_val
    body = pair
    size = len(body) + 8 + 16
    assert len(block) == 8 + len(body) + 8 + 16, "block length drifted between passes"
    block = _u64(size) + body + _u64(size) + MAGIC
    assert len(block) == len(probe)

    # splice: entries | BLOCK | central directory | EOCD; EOCD's cd_offset
    # field (at +16 of the EOCD, which sits at the very END of the file)
    # must then point at the block start (the CD's new home)
    out = bytearray(data)
    eocd_off = out.rfind(b"PK\x05\x06")
    assert eocd_off == len(out) - 22, "EOCD must be the final 22 bytes (no zip comment)"
    cd_off = int.from_bytes(out[eocd_off + 16:eocd_off + 20], "little")
    assert data[cd_off:cd_off + 4] == b"PK\x01\x02", "cd_offset must point at the central directory"
    out[cd_off:cd_off] = block
    new_eocd = len(out) - 22
    out[new_eocd + 16:new_eocd + 20] = _u32(cd_off + len(block))
    open(out_path, "wb").write(bytes(out))
    return len(block)

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
    # every world asset must physically exist in the zip (v2.0 regression guard)
    with zipfile.ZipFile(out_path) as z:
        names = set(z.namelist())
        for req in ["assets/index.html", "assets/vendor/three.min.js", "assets/data/streets_real.js",
                    "assets/data/dem.js", "assets/data/buildings_real.js", "resources.arsc", "classes.dex"]:
            assert req in names, "MISSING FROM APK: " + req
        print("   apk entries ok:", len(names), "files")
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


def validate_dex_callsites(dex_bytes):
    """FAIL the build if any android.* method ref uses java.lang.Object params
    (the stub-descriptor bug that made every previous build crash on device)."""
    d = dex_bytes
    def u32(o): return struct.unpack_from("<I", d, o)[0]
    def u16(o): return struct.unpack_from("<H", d, o)[0]
    str_size, str_off = u32(56), u32(60)
    strings = []
    for i in range(str_size):
        off = u32(str_off + 4 * i)
        result = 0; shift = 0; p = off
        while True:
            b = d[p]; p += 1
            result |= (b & 0x7f) << shift
            if not (b & 0x80): break
            shift += 7
        strings.append(d[p:p + result].decode("utf-8", "replace"))
    type_off = u32(68)
    proto_off, proto_size = u32(76), u32(72)
    def t(idx): return strings[u32(type_off + 4 * idx)]
    protos = []
    for i in range(proto_size):
        o = proto_off + i * 12
        ret = t(u32(o + 4)); pp = u32(o + 8)
        sig = "("
        if pp:
            n = u16(pp)
            for j in range(n): sig += t(u16(pp + 2 + 2 * j))
        protos.append(sig + ")" + ret)
    meth_size, meth_off = u32(88), u32(92)
    bad = []
    refs = []
    for i in range(meth_size):
        o = meth_off + i * 8
        cls = t(u16(o)); name = strings[u32(o + 4)]; sig = protos[u16(o + 2)]
        refs.append(f"{cls}->{name} {sig}")
        if cls.startswith("Landroid/") and "Ljava/lang/Object;" in sig:
            bad.append(refs[-1])
    print("  dex method refs (" + str(len(refs)) + "):")
    for r in sorted(set(refs)):
        print("   ", r)
    assert not bad, "STUB-DESCRIPTOR BUG REGRESSION: " + "; ".join(bad)
    print("  no Object-typed android callsites — descriptor-safe")


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
