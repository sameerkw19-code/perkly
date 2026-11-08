// Wallet logos, made in the browser when the card is published (canvas):
// the business's logo without a white background, trimmed to its edges so it shows as large as the
// wallet allows. Apple Wallet gets the trimmed logo; Google Wallet, which shows the logo in a circle,
// gets it centred in a transparent square.

const MAX_SIDE = 800;

function load(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

const HARD = 238; // at least this white: fully transparent
const SOFT = 200; // between SOFT and HARD: edge pixels fade

/**
 * Makes the white background transparent.
 * A logo on a white rectangle loses all its white, including the holes inside letters. A logo that is already transparent loses a white
 * plate behind it (a circle or rounded square covering most of the picture), but white letters or
 * lines on a transparent logo stay.
 */
export function removeWhite(px: Uint8ClampedArray, w: number, h: number): void {
  const white = (i: number) => Math.min(px[i], px[i + 1], px[i + 2]);
  const clear = (i: number) => px[i + 3] < 24;
  const n = w * h;
  // Pass 1: from the edges, through transparent and white pixels; group the white ones into regions.
  const region = new Int32Array(n).fill(-1);
  const boxes: { x0: number; y0: number; x1: number; y1: number; pixels: number[] }[] = [];
  const outside = new Uint8Array(n);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  const near = (p: number, push: (q: number) => void) => {
    const x = p % w;
    if (x > 0) push(p - 1);
    if (x < w - 1) push(p + 1);
    if (p >= w) push(p - w);
    if (p < n - w) push(p + w);
  };
  // Transparent area reachable from the edge.
  while (stack.length) {
    const p = stack.pop()!;
    if (outside[p] || !clear(p * 4)) continue;
    outside[p] = 1;
    near(p, (q) => stack.push(q));
  }
  // White regions touching the edge or the transparent outside.
  const seeds: number[] = [];
  for (let p = 0; p < n; p++) {
    if (outside[p] || white(p * 4) < SOFT || clear(p * 4)) continue;
    const x = p % w, y = (p / w) | 0;
    let touches = x === 0 || y === 0 || x === w - 1 || y === h - 1;
    if (!touches) near(p, (q) => { if (outside[q]) touches = true; });
    if (touches) seeds.push(p);
  }
  for (const seed of seeds) {
    if (region[seed] !== -1) continue;
    const id = boxes.length;
    const box = { x0: w, y0: h, x1: 0, y1: 0, pixels: [] as number[] };
    boxes.push(box);
    stack.push(seed);
    while (stack.length) {
      const p = stack.pop()!;
      if (region[p] !== -1 || outside[p] || clear(p * 4) || white(p * 4) < SOFT) continue;
      region[p] = id;
      box.pixels.push(p);
      const x = p % w, y = (p / w) | 0;
      box.x0 = Math.min(box.x0, x); box.x1 = Math.max(box.x1, x);
      box.y0 = Math.min(box.y0, y); box.y1 = Math.max(box.y1, y);
      near(p, (q) => stack.push(q));
    }
  }
  // An opaque picture: white touching its border is the background. A transparent one: only a white
  // plate covering most of it (white letters may touch the border there and must stay).
  const transparent = outside.some((v) => v === 1);
  // An opaque picture on white: all its white goes, including the holes inside letters (B, A, O).
  if (!transparent && boxes.some((b) => b.x0 === 0 || b.y0 === 0 || b.x1 === w - 1 || b.y1 === h - 1)) {
    for (let i = 0; i < px.length; i += 4) {
      const v = white(i);
      if (v >= SOFT) px[i + 3] = v >= HARD ? 0 : Math.round(((HARD - v) / (HARD - SOFT)) * px[i + 3]);
    }
    return;
  }
  for (const b of boxes) {
    const border = b.x0 === 0 || b.y0 === 0 || b.x1 === w - 1 || b.y1 === h - 1;
    const plate = b.x1 - b.x0 + 1 >= w * 0.6 && b.y1 - b.y0 + 1 >= h * 0.6;
    if (transparent ? !plate : !border) continue;
    for (const p of b.pixels) {
      const i = p * 4;
      const v = white(i);
      px[i + 3] = v >= HARD ? 0 : Math.round(((HARD - v) / (HARD - SOFT)) * px[i + 3]);
    }
  }
}

/** The box around the visible pixels, or null when nothing is visible. */
function visibleBox(px: Uint8ClampedArray, w: number, h: number) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (px[(y * w + x) * 4 + 3] > 16) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

function png(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/png"));
}

const lum = (r: number, g: number, b: number) => {
  const c = (v: number) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
};

/** How well the visible part of the logo stands out on the card color (WCAG contrast of its average color). */
function contrastOn(px: Uint8ClampedArray, bgHex: string): number {
  let r = 0, g = 0, b = 0, a = 0;
  for (let i = 0; i < px.length; i += 4) {
    const w = px[i + 3] / 255;
    r += px[i] * w; g += px[i + 1] * w; b += px[i + 2] * w; a += w;
  }
  if (!a) return 0;
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(bgHex);
  const bg = m ? lum(parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)) : 0;
  const fg = lum(r / a, g / a, b / a);
  return (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);
}

/**
 * Apple and Google Wallet versions of the logo at `src`, or null if it cannot be read.
 * `bg`: the card color. When the logo without its white background would hardly show on it
 * (a dark logo on a dark card), the white background is kept and the logo is only trimmed.
 */
export async function makeWalletLogos(src: string, bg: string): Promise<{ apple: Blob; google: Blob } | null> {
  const img = await load(src);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h);
  const original = new Uint8ClampedArray(data.data);
  removeWhite(data.data, w, h);
  if (contrastOn(data.data, bg) < 1.8) data.data.set(original);
  ctx.putImageData(data, 0, 0);
  const box = visibleBox(data.data, w, h);
  if (!box) return null;

  // Apple: trimmed, with a hair of space so antialiased edges are not cut.
  const pad = Math.round(Math.max(box.w, box.h) * 0.02);
  const apple = document.createElement("canvas");
  apple.width = box.w + pad * 2;
  apple.height = box.h + pad * 2;
  apple.getContext("2d")!.drawImage(canvas, box.x, box.y, box.w, box.h, pad, pad, box.w, box.h);

  // Google: centred in a square; the logo fills about 80% so the round crop does not cut it.
  const side = Math.round(Math.max(box.w, box.h) / 0.8);
  const google = document.createElement("canvas");
  google.width = side;
  google.height = side;
  google.getContext("2d")!.drawImage(canvas, box.x, box.y, box.w, box.h, Math.round((side - box.w) / 2), Math.round((side - box.h) / 2), box.w, box.h);

  return { apple: await png(apple), google: await png(google) };
}
