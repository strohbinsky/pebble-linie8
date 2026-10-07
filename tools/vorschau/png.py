import sys, zlib, struct
def png(raw, w, h, out, s=2):
    rows = b""
    for y in range(h):
        line = b"".join(raw[(y*w+x)*3:(y*w+x)*3+3]*s for x in range(w))
        rows += (b"\x00" + line) * s
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    open(out, "wb").write(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w*s, h*s, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(rows)) + chunk(b"IEND", b""))
png(open(sys.argv[1], "rb").read(), 200, 228, sys.argv[2])
