/**
 * The Apple Wallet strip of the average card: the card's color with a progress bar along the bottom.
 * The pass prints the count ("23 / 40") over it as its primary field, so the picture has no text.
 * Drawn here as a PNG (no canvas on the server): 1125×432 pixels, the @3x strip size.
 */

const W = 1125;
const H = 432;
/** The bar: 48px from the sides, 30px tall (10 points), its bottom 66px above the strip's bottom. */
const BAR_X = 48;
const BAR_H = 30;
const BAR_Y = H - 66 - BAR_H;

type RGB = [number, number, number];

function hex(c: string): RGB {
  const h = /^#?([0-9a-f]{6})$/i.exec(c.trim())?.[1] ?? "000000";
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
}
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

async function zlib(raw: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([raw as BlobPart]).stream().pipeThrough(new CompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** How much of a pixel lies inside a rounded bar from x0 to x1 (ends are half circles), 0 to 1. */
function cover(x: number, y: number, x0: number, x1: number): number {
  const r = BAR_H / 2;
  const cy = BAR_Y + r;
  const px = x + 0.5, py = y + 0.5;
  if (x1 - x0 < 1) return 0;
  const left = x0 + r, right = Math.max(left, x1 - r);
  const cx = px < left ? left : px > right ? right : px;
  const d = Math.hypot(px - cx, py - cy);
  return Math.max(0, Math.min(1, r - d + 0.5));
}

export async function progressStrip(o: {
  /** The card's main color, its gradient's second color, the text color and the stamp color. */
  bg: string; bg2?: string; fg: string; fill: string;
  done: number; target: number;
  /** Hebrew and Arabic cards fill the bar from the right. */
  rtl: boolean;
}): Promise<Uint8Array<ArrayBuffer>> {
  const top = hex(o.bg);
  const bottom = o.bg2 ? hex(o.bg2) : mix(top, [0, 0, 0], 0.18);
  const fg = hex(o.fg);
  const fill = hex(o.fill);
  const share = o.target > 0 ? Math.max(0, Math.min(1, o.done / o.target)) : 0;
  const x0 = BAR_X, x1 = W - BAR_X;
  const filled = (x1 - x0) * share;
  const f0 = o.rtl ? x1 - filled : x0;
  const f1 = o.rtl ? x1 : x0 + filled;

  const row = 1 + W * 3;
  const raw = new Uint8Array(H * row);
  for (let y = 0; y < H; y++) {
    const base = mix(top, bottom, y / (H - 1));
    const track = mix(base, fg, 0.22);
    const at = y * row;
    raw[at] = 0; // no filter
    for (let x = 0; x < W; x++) {
      let px = base;
      if (y >= BAR_Y - 1 && y <= BAR_Y + BAR_H) {
        const t = cover(x, y, x0, x1);
        if (t > 0) {
          px = mix(base, track, t);
          // The filled part keeps its own round ends inside the track.
          const f = share > 0 ? cover(x, y, f0, f1) : 0;
          if (f > 0) px = mix(px, fill, f);
        }
      }
      const i = at + 1 + x * 3;
      raw[i] = px[0]; raw[i + 1] = px[1]; raw[i + 2] = px[2];
    }
  }

  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, W);
  v.setUint32(4, H);
  ihdr.set([8, 2, 0, 0, 0], 8); // 8-bit RGB
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", await zlib(raw)),
    chunk("IEND", new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) { out.set(p, at); at += p.length; }
  return out;
}
