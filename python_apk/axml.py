#!/usr/bin/env python3
"""Binary AndroidManifest.xml (AXML) writer + verifier decoder.
Layout follows aapt conventions: attribute-name strings occupy the head of the
string pool and are covered positionally by the resource-map chunk (0x0180)."""
import struct

NS_ANDROID = "http://schemas.android.com/apk/res/android"
PFX_ANDROID = "android"

ATTR = {
    "theme": 0x01010000, "label": 0x01010001, "icon": 0x01010002, "name": 0x01010003,
    "exported": 0x01010010, "screenOrientation": 0x0101001e, "configChanges": 0x0101001f,
    "hasCode": 0x0101000c, "process": 0x01010011, "launchMode": 0x0101001d,
    "versionCode": 0x0101021b, "versionName": 0x0101021c, "minSdkVersion": 0x0101020c,
    "targetSdkVersion": 0x01010270, "allowBackup": 0x01010280,
    "hardwareAccelerated": 0x010102d3, "supportsRtl": 0x010103af,
}
STYLE = {"Theme.Black.NoTitleBar.Fullscreen": 0x0103000a}

T_STRING, T_INT, T_BOOL, T_REF = 0x03, 0x10, 0x12, 0x01


class Node:
    def __init__(self, name, attrs=None, children=None):
        self.name = name
        self.attrs = attrs or []   # (ns|None, name, value)
        self.children = children or []


def _attr_value(v):
    if isinstance(v, tuple):
        kind, val = v
        if kind == "ref": return T_REF, val, None
        if kind == "int": return T_INT, val, None
        if kind == "bool": return T_BOOL, (0xFFFFFFFF if val else 0), None
        if kind == "str": return T_STRING, None, val
    if isinstance(v, bool): return T_BOOL, (0xFFFFFFFF if v else 0), None
    if isinstance(v, int): return T_INT, v, None
    return T_STRING, None, v


def collect(root):
    """Return (attr_names_in_order, other_strings, nodes) with attr names first."""
    attr_order, attr_set, other = [], set(), []

    def add_other(s):
        if s not in attr_set and s not in other:
            other.append(s)

    def walk(node):
        add_other(node.name)
        for (ns, aname, aval) in node.attrs:
            if aname not in attr_set:
                attr_set.add(aname)
                attr_order.append(aname)
            if ns: add_other(ns)
            dtype, ddata, raw = _attr_value(aval)
            if raw is not None: add_other(raw)
        for c in node.children:
            walk(c)
    walk(root)
    return attr_order, other


def encode(root):
    attr_order, other = collect(root)
    # pool: attr names first (mapped), then everything else
    pool = list(attr_order)
    pidx = {s: i for i, s in enumerate(pool)}

    def pi(s):
        if s not in pidx:
            pidx[s] = len(pool)
            pool.append(s)
        return pidx[s]

    ns_uri_i = pi(NS_ANDROID)
    ns_pfx_i = pi(PFX_ANDROID)
    line = [2]

    def prep(node):
        name_i = pi(node.name)
        attrs = []
        for (ns, aname, aval) in node.attrs:
            ans_i = pi(ns) if ns else 0xFFFFFFFF
            aname_i = pidx[aname]
            dtype, ddata, raw = _attr_value(aval)
            raw_i = pi(raw) if raw is not None else 0xFFFFFFFF
            if raw is not None:
                ddata = raw_i
            attrs.append((ans_i, aname_i, raw_i, dtype, ddata if ddata is not None else 0))
        return (name_i, attrs, [prep(c) for c in node.children])

    tree = prep(root)

    # string pool chunk (UTF-16LE)
    offsets, data = [], bytearray()
    for s in pool:
        offsets.append(len(data))
        u = s.encode("utf-16-le")
        data += struct.pack("<H", len(s)) + u + b"\x00\x00"
    while len(data) % 4:
        data += b"\x00"
    strings_start = 28 + 4 * len(pool)
    spool = struct.pack("<HHIIIIII", 0x0001, 28, strings_start + len(data), len(pool),
                        0, 0, strings_start, 0)
    spool += b"".join(struct.pack("<I", o) for o in offsets)
    spool += bytes(data)

    def chunk(t, payload, hs=16):
        # node chunks: headerSize counts type..comment (16), file size = 8 + payload
        return struct.pack("<HHI", t, hs, 8 + len(payload)) + payload

    def start_ns():
        return chunk(0x0100, struct.pack("<IIII", line[0], 0xFFFFFFFF, ns_pfx_i, ns_uri_i))

    def end_ns():
        return chunk(0x0101, struct.pack("<IIII", line[0] + 1, 0xFFFFFFFF, ns_pfx_i, ns_uri_i))

    def el(node_tuple, is_start):
        line[0] += 1
        name_i, attrs, _ = node_tuple
        if is_start:
            body = struct.pack("<IIII", line[0], 0xFFFFFFFF, 0xFFFFFFFF, name_i)
            body += struct.pack("<HHHHHH", 0x14, 0x14, len(attrs), 0, 0, 0)
            for (ans_i, aname_i, raw_i, dtype, ddata) in attrs:
                body += struct.pack("<III", ans_i, aname_i, raw_i)
                body += struct.pack("<HBBI", 8, 0, dtype, ddata)
            return chunk(0x0102, body)
        return chunk(0x0103, struct.pack("<IIII", line[0], 0xFFFFFFFF, 0xFFFFFFFF, name_i))

    def emit(node_tuple):
        name_i, attrs, children = node_tuple
        b = el(node_tuple, True)
        for c in children:
            b += emit(c)
        b += el(node_tuple, False)
        return b

    # resource map: one u32 per attr-name string (positional over pool head)
    resmap = chunk(0x0180, b"".join(
        struct.pack("<I", ATTR.get(n, 0)) for n in attr_order), hs=8)

    body = start_ns() + emit(tree) + end_ns()
    total = 8 + len(spool) + len(resmap) + len(body)
    return struct.pack("<HHI", 0x0003, 8, total) + spool + resmap + body


def decode(data):
    """Walk chunks; return list of events and verify balance + sizes."""
    def u16(o): return struct.unpack_from("<H", data, o)[0]
    def u32(o): return struct.unpack_from("<I", data, o)[0]
    assert u16(0) == 0x0003 and u16(2) == 8, "not AXML"
    strings, events, stack = [], [], []
    off = 8
    while off < len(data):
        t, hs, size = u16(off), u16(off + 2), u32(off + 4)
        assert hs in (8, 16, 28) and size >= hs and off + size <= len(data), "bad chunk bounds"
        if t == 0x0001:
            count = u32(off + 8)
            strings_start = u32(off + 20)
            for i in range(count):
                o = off + strings_start + u32(off + 28 + 4 * i)
                ln = u16(o)
                strings.append(data[o + 2:o + 2 + ln * 2].decode("utf-16-le"))
        elif t == 0x0180:
            n = (size - hs) // 4
            ids = [u32(off + hs + 4 * i) for i in range(n)]
            assert all(ids[pidx] == ATTR.get(s, 0) for pidx, s in enumerate(strings[:n])), "attr id map mismatch"
        elif t == 0x0100:
            events.append(("ns", strings[u32(off + 16)], strings[u32(off + 20)]))
        elif t == 0x0101:
            events.append(("/ns",))
        elif t == 0x0102:
            name_i = u32(off + 20)
            acount = u16(off + 28)
            attrs = []
            for i in range(acount):
                a = off + 36 + i * 20
                ans, aname, raw = u32(a), u32(a + 4), u32(a + 8)
                dtype, ddata = data[a + 15], u32(a + 16)
                def s(ix): return strings[ix] if ix != 0xFFFFFFFF and ix < len(strings) else None
                if dtype == T_STRING: val = s(raw)
                elif dtype == T_BOOL: val = bool(ddata)
                elif dtype == T_INT: val = ddata
                elif dtype == T_REF: val = hex(ddata)
                else: val = hex(ddata)
                attrs.append((s(ans), s(aname), val))
            events.append(("start", strings[name_i], attrs))
            stack.append(name_i)
        elif t == 0x0103:
            name_i = u32(off + 20)
            assert stack and stack[-1] == name_i, "unbalanced elements"
            stack.pop()
            events.append(("end", strings[name_i]))
        off += size
    assert not stack, "unbalanced tree"
    return events
