#!/usr/bin/env python3
"""Dump method names+descriptors of a .class file (minimal constant-pool parser)."""
import sys, struct, zipfile, io

def parse(data):
    assert data[:4] == b"\xca\xfe\xba\xbe", "not a class file"
    off = 8  # skip magic+version
    n = struct.unpack_from(">H", data, off)[0]; off += 2
    cp = [None] * n  # 1-indexed
    i = 1
    while i < n:
        tag = data[off]; off += 1
        if tag == 1:  # Utf8
            ln = struct.unpack_from(">H", data, off)[0]; off += 2
            cp[i] = ("Utf8", data[off:off + ln].decode("utf-8", "replace")); off += ln
        elif tag in (7, 8, 16, 19, 20):  # Class/String/MethodType/Module/Package
            cp[i] = (tag, struct.unpack_from(">H", data, off)[0]); off += 2
        elif tag == 15:  # MethodHandle: 1 + 2 bytes
            cp[i] = (tag, data[off:off + 3]); off += 3
        elif tag in (3, 4, 9, 10, 11, 12, 17, 18):  # int/float/fieldref/methodref/ifaceref/nameandtype/dynamic/invokedynamic
            cp[i] = (tag, data[off:off + 4]); off += 4
        elif tag in (5, 6):  # long/double
            cp[i] = (tag, data[off:off + 8]); off += 8; i += 1
        elif tag == 16:
            pass
        else:
            raise ValueError(f"tag {tag} @ {i}")
        i += 1
    def utf(idx): return cp[idx][1]
    def cls_name(idx):
        name_idx = struct.unpack(">H", cp[idx][1])[0] if isinstance(cp[idx][1], bytes) else cp[idx][1]
        return utf(name_idx)
    # skip access, this, super
    off += 6
    # interfaces
    ni = struct.unpack_from(">H", data, off)[0]; off += 2 + 2 * ni
    # fields
    nf = struct.unpack_from(">H", data, off)[0]; off += 2
    for _ in range(nf):
        off += 6
        na = struct.unpack_from(">H", data, off)[0]; off += 2
        for _ in range(na): off += 2 + struct.unpack_from(">H", data, off)[0]
    # methods
    nm = struct.unpack_from(">H", data, off)[0]; off += 2
    out = []
    for _ in range(nm):
        acc, name_i, desc_i = struct.unpack_from(">HHH", data, off); off += 6
        out.append((utf(name_i), utf(desc_i), acc))
        na = struct.unpack_from(">H", data, off)[0]; off += 2
        for _ in range(na): off += 2 + struct.unpack_from(">H", data, off)[0]
    return out

def main():
    jarpath, member = sys.argv[1], sys.argv[2]
    z = zipfile.ZipFile(jarpath)
    data = z.read(member)
    for name, desc, acc in parse(data):
        static = "S" if acc & 0x8 else " "
        pub = "P" if acc & 0x1 else " "
        print(f"{pub}{static} {name} {desc}")

if __name__ == "__main__":
    main()
