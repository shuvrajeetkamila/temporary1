#!/usr/bin/env python3
"""Minimal resources.arsc writer: one package, mipmap icon file-entries across
densities + one string resource. Hand-built ResTable chunks (no aapt)."""
import struct


def utf16_pool(strings):
    offsets, data = [], bytearray()
    for s in strings:
        offsets.append(len(data))
        u = s.encode("utf-16-le")
        data += struct.pack("<H", len(s)) + u + b"\x00\x00"
    while len(data) % 4:
        data += b"\x00"
    strings_start = 28 + 4 * len(strings)
    out = struct.pack("<HHIIIIII", 0x0001, 28, strings_start + len(data), len(strings),
                      0, 0, strings_start, 0)
    out += b"".join(struct.pack("<I", o) for o in offsets)
    out += bytes(data)
    return out


def config_bytes(density=0):
    # ResTable_config, classic 28-byte form: size,imsi,locale,screenType(density@14),
    # input,screenSize  (density 0 = default/any)
    return struct.pack("<I", 28) + struct.pack("<HH", 0, 0) + b"\x00\x00\x00\x00" + \
        b"\x00\x00\x00\x00" + struct.pack("<BBH", 0, 0, density) + b"\x00\x00\x00\x00" + \
        struct.pack("<HH", 0, 0)
    #                     ^imsi                   ^locale        ^screenType      ^input         ^screenSize


def build(densities, app_label):
    """densities: list of (name, dpi) e.g. [("mdpi",160),...]. Files must exist at
    res/mipmap-<name>-v4/ic_launcher.png inside the APK."""
    # table-level value strings: icon paths then label
    values = [f"res/mipmap-{d}-v4/ic_launcher.png" for d, _ in densities]
    label_idx = len(values)
    values.append(app_label)
    gpool = utf16_pool(values)

    # type pool: ALL types, positional — type id = index+1 ("mipmap"=1, "string"=2)
    type_pool = utf16_pool(["mipmap", "string"])
    key_pool = utf16_pool(["app_name", "ic_launcher"])     # keys 0,1

    def res_value(data_idx):
        return struct.pack("<HBBI", 8, 0, 0x03, data_idx)  # Res_value STRING

    def type_chunk(type_id, density, value_idx, key_idx):
        entry_count = 1
        # headerSize covers chunk header + id/flags/reserved + entryCount +
        # entriesStart + config(28) = 48; offset array follows, then entries
        header_size = 48
        entries_start = header_size + 4 * entry_count
        payload = struct.pack("<BBH", type_id, 0, 0)
        payload += struct.pack("<I", entry_count)
        payload += struct.pack("<I", entries_start)
        payload += config_bytes(density)
        payload += struct.pack("<I", 0)                    # entry offset[0]
        payload += struct.pack("<HH", 8, 0) + struct.pack("<I", key_idx)
        payload += res_value(value_idx)
        size = entries_start + 16                          # entry(8) + value(8)
        return struct.pack("<HHI", 0x0201, header_size, size) + payload

    icon_key, name_key = 1, 0
    body = b""
    for i, (d, dpi) in enumerate(densities):
        body += type_chunk(1, dpi, i, icon_key)
    body += type_chunk(2, 0, label_idx, name_key)

    pkg_name = "com.arena.islandrealm"
    name_bytes = pkg_name.encode("utf-16-le")[:256]
    name_bytes += b"\x00" * (256 - len(name_bytes))

    type_str_off = 284  # pkg header: 8 + id(4) + name(256) + 4×u4
    key_str_off = type_str_off + len(type_pool)
    pkg_size = 284 + len(type_pool) + len(key_pool) + len(body)
    pkg_header = (struct.pack("<HHI", 0x0200, 284, pkg_size)
                  + struct.pack("<I", 0x7F)
                  + name_bytes
                  + struct.pack("<IIII", type_str_off, 2, key_str_off, 1))
    assert len(pkg_header) == 284, len(pkg_header)

    total = 12 + len(gpool) + pkg_size
    table = struct.pack("<HHII", 0x0002, 12, total, 1)
    return table + gpool + pkg_header + type_pool + key_pool + body


if __name__ == "__main__":
    d = build([("mdpi", 160), ("hdpi", 240), ("xhdpi", 320), ("xxhdpi", 480), ("xxxhdpi", 640)],
              "Island Realm: Mumbai–Navi Mumbai")
    open("android/res/resources.arsc", "wb").write(d)
    print("resources.arsc:", len(d), "bytes")
