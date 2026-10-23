// Reads the type and pixel size of an uploaded image from its own bytes (never trusts the browser).

export type ImageInfo = { mime: "image/png" | "image/jpeg" | "image/webp"; width: number; height: number };

export function imageInfo(buf: Uint8Array): ImageInfo | null {
  const u32 = (o: number) => ((buf[o] << 24) | (buf[o + 1] << 16) | (buf[o + 2] << 8) | buf[o + 3]) >>> 0;
  const u16be = (o: number) => (buf[o] << 8) | buf[o + 1];
  const u16le = (o: number) => buf[o] | (buf[o + 1] << 8);
  const u24le = (o: number) => buf[o] | (buf[o + 1] << 8) | (buf[o + 2] << 16);

  // PNG
  if (buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) {
    return { mime: "image/png", width: u32(16), height: u32(20) };
  }
  // JPEG: walk segments to the first SOF marker
  if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let o = 2;
    while (o + 9 < buf.length) {
      if (buf[o] !== 0xff) { o++; continue; }
      const marker = buf[o + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { o += 2; continue; }
      const len = u16be(o + 2);
      if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { mime: "image/jpeg", height: u16be(o + 5), width: u16be(o + 7) };
      }
      o += 2 + len;
    }
    return null;
  }
  // WebP (RIFF....WEBP)
  if (buf.length > 30 && buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
      buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) {
    const chunk = String.fromCharCode(buf[12], buf[13], buf[14], buf[15]);
    if (chunk === "VP8X") return { mime: "image/webp", width: u24le(24) + 1, height: u24le(27) + 1 };
    if (chunk === "VP8L") {
      const b0 = buf[21], b1 = buf[22], b2 = buf[23], b3 = buf[24];
      return { mime: "image/webp", width: 1 + (((b1 & 0x3f) << 8) | b0), height: 1 + (((b3 & 0xf) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)) };
    }
    if (chunk === "VP8 ") return { mime: "image/webp", width: u16le(26) & 0x3fff, height: u16le(28) & 0x3fff };
  }
  return null;
}
