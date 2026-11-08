// Draws the wallet "stamp banner": title, stamp count, a row of stamps and the reward line, as one picture.
// Google Wallet (and later Apple Wallet) shows a picture, not live elements, so the editor draws one
// picture per stamp count (0…target) when publishing, and the server picks the right one for each pass.
// Browser only (canvas). Drawn at the Google Wallet hero size.

import { createElement, type ComponentType } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Gift } from "lucide-react";
import { FONTS, is3d, isRtl, onColor, stamp3dUrl, textsFor, type Design, type Lang } from "../lib/design";
import { ICONS } from "./loyalty-card";
import { PIZZA_COLORS, slicePath, slicesPath, toppings, usesPizza } from "../lib/pizza";

export const BANNER_W = 1032;
export const BANNER_H = 336;
const GOLD = "#F5C542";

type Picture = HTMLImageElement;
export type BannerPictures = {
  /** Stamp picture (own image or logo), or null for a preset icon. */
  filled: Picture | null;
  /** Own picture for an empty stamp; without it the filled one is drawn faded. */
  empty: Picture | null;
  round: boolean;
  /** Preset icon in the colors it is drawn with. */
  iconOnStamp: Picture | null;
  iconOnCard: Picture | null;
  giftOnCard: Picture;
  giftOnFill: Picture;
  /** The business's own pizza photo for the pizza progress. */
  pizza: Picture | null;
  /** The wallet banner or background image, drawn behind the stamp grid. */
  background: Picture | null;
};

function loadImage(src: string): Promise<Picture> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image"));
    img.src = src;
  });
}

/** A lucide icon as a picture in one color. Rendered off-screen, outside React's render phase. */
function iconPicture(Icon: ComponentType<{ size?: number; color?: string; strokeWidth?: number }>, color: string): Promise<Picture> {
  const host = document.createElement("div");
  const root = createRoot(host);
  flushSync(() => root.render(createElement(Icon, { size: 96, color, strokeWidth: 1.8 })));
  let svg = host.innerHTML;
  root.unmount();
  if (!svg.includes("xmlns=")) svg = svg.replace("<svg", '<svg xmlns="http://www.w3.org/2000/svg"');
  return loadImage("data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg));
}

const asset = (id: string) => `/api/asset/${id}`;

/** Loads fonts and pictures once; reuse the result for every stamp count. */
export async function loadBannerPictures(design: Design): Promise<BannerPictures> {
  const family = FONTS[design.look.font].family;
  await Promise.all([document.fonts.load(`600 40px ${family}`), document.fonts.load(`500 24px ${family}`)]).catch(() => undefined);
  const { icon, image, emptyImage } = design.stamp;
  // A picture stamp: the business's own image, its logo, or one of the 3D pictures (with a faded version for empty stamps).
  const own = icon === "image" && image ? asset(image) : icon === "logo" && design.logo ? asset(design.logo) : is3d(icon) ? stamp3dUrl(icon) : null;
  const ownEmpty = icon === "image" && emptyImage ? asset(emptyImage) : is3d(icon) ? stamp3dUrl(icon, true) : null;
  const bright = design.look.stampStyle === "bright";
  const giftColor = bright ? GOLD : design.colors.stamp;
  const preset = !own && icon !== "image" && icon !== "logo" ? ICONS[icon as keyof typeof ICONS] : null;
  const backgroundId = design.walletHero ?? design.hero;
  const [filled, empty, iconOnStamp, iconOnCard, giftOnCard, giftOnFill, pizza, background] = await Promise.all([
    own ? loadImage(own) : Promise.resolve(null),
    own && ownEmpty ? loadImage(ownEmpty) : Promise.resolve(null),
    preset ? iconPicture(preset, onColor(design.colors.stamp)) : Promise.resolve(null),
    preset ? iconPicture(preset, design.colors.fg) : Promise.resolve(null),
    iconPicture(Gift, giftColor),
    iconPicture(Gift, onColor(giftColor)),
    design.look.progress === "pizza" && design.progressImage ? loadImage(asset(design.progressImage)) : Promise.resolve(null),
    backgroundId ? loadImage(asset(backgroundId)).catch(() => null) : Promise.resolve(null),
  ]);
  return { filled, empty, round: icon === "logo", iconOnStamp, iconOnCard, giftOnCard, giftOnFill, pizza, background };
}

function drawContain(ctx: CanvasRenderingContext2D, img: Picture, x: number, y: number, size: number, round: boolean) {
  const s = Math.min(size / img.naturalWidth, size / img.naturalHeight);
  const w = img.naturalWidth * s, h = img.naturalHeight * s;
  ctx.save();
  if (round) {
    ctx.beginPath();
    ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
    ctx.clip();
    const c = Math.max(size / img.naturalWidth, size / img.naturalHeight);
    ctx.drawImage(img, x + (size - img.naturalWidth * c) / 2, y + (size - img.naturalHeight * c) / 2, img.naturalWidth * c, img.naturalHeight * c);
  } else {
    ctx.drawImage(img, x + (size - w) / 2, y + (size - h) / 2, w, h);
  }
  ctx.restore();
}

function circle(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2 - 1.5, 0, Math.PI * 2);
}

function drawStamp(ctx: CanvasRenderingContext2D, d: Design, p: BannerPictures, x: number, y: number, size: number, filled: boolean) {
  const bright = d.look.stampStyle === "bright";
  if (p.filled) {
    if (filled) return drawContain(ctx, p.filled, x, y, size, p.round);
    if (p.empty) return drawContain(ctx, p.empty, x, y, size, false);
    ctx.save();
    ctx.globalAlpha = bright ? 0.18 : 0.28;
    drawContain(ctx, p.filled, x, y, size, p.round);
    ctx.restore();
    return;
  }
  ctx.save();
  circle(ctx, x, y, size);
  if (filled) {
    ctx.fillStyle = d.colors.stamp;
    ctx.fill();
    if (p.iconOnStamp) ctx.drawImage(p.iconOnStamp, x + size * 0.22, y + size * 0.22, size * 0.56, size * 0.56);
  } else {
    if (bright) {
      ctx.fillStyle = "rgba(0,0,0,.6)";
      ctx.fill();
    } else {
      ctx.globalAlpha = 0.4;
      ctx.strokeStyle = d.colors.fg;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.globalAlpha = bright ? 0.22 : 0.35;
    if (p.iconOnCard) ctx.drawImage(p.iconOnCard, x + size * 0.22, y + size * 0.22, size * 0.56, size * 0.56);
  }
  ctx.restore();
}

/** Letter spacing only for text without Hebrew or Arabic letters (it breaks Arabic joining and looks wrong in Hebrew). */
const latinOnly = (s: string) => !/[\u0590-\u06FF\u0750-\u077F\uFB1D-\uFEFC]/.test(s);

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // Letter spacing where the browser supports it on canvas; plain text elsewhere.
  if ("letterSpacing" in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${px}px`;
}

/** Draws the Google Wallet banner for `stamps` out of `target`: the stamp grid, or the pizza. */
export function drawStampBanner(ctx: CanvasRenderingContext2D, d: Design, p: BannerPictures, stamps: number, target: number) {
  const W = BANNER_W, H = BANNER_H;
  ctx.fillStyle = d.colors.bg;
  ctx.fillRect(0, 0, W, H);
  if (usesPizza(d, target)) return drawPizzaBanner(ctx, d, p, stamps, target);
  // Same stamp grid as the Apple Wallet strip, so both wallets look alike.
  drawStampGrid(ctx, d, p, stamps, target, W, H);
}

/** Pizza progress: the pizza on the starting side, title, count and reward beside it. */
function drawPizzaBanner(ctx: CanvasRenderingContext2D, d: Design, p: BannerPictures, stamps: number, target: number) {
  const lang: Lang = d.langs[0];
  const text = textsFor(d, lang);
  const rtl = isRtl(lang);
  const family = FONTS[d.look.font].family;
  const W = BANNER_W, H = BANNER_H;
  const k = Math.max(0, Math.min(target, stamps));
  const full = k >= target;
  const r = 124, cy = H / 2, cx = rtl ? W - 190 : 190;

  // Tray.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r + 14, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(0,0,0,.28)";
  ctx.fill();
  ctx.lineWidth = full ? 5 : 2;
  ctx.strokeStyle = full ? PIZZA_COLORS.gold : d.colors.fg;
  ctx.globalAlpha = full ? 1 : 0.25;
  ctx.stroke();
  ctx.restore();

  // Slices still to collect: dashed outlines.
  ctx.save();
  ctx.setLineDash([8, 8]);
  ctx.lineWidth = 2;
  ctx.strokeStyle = d.colors.fg;
  ctx.globalAlpha = 0.4;
  for (let i = k; i < target; i++) ctx.stroke(new Path2D(slicePath(cx, cy, r, i, target)));
  ctx.restore();

  // Collected slices: the business's photo, or a drawn pizza.
  if (k > 0 && p.pizza) {
    ctx.save();
    ctx.clip(new Path2D(slicesPath(cx, cy, r, k, target)));
    const s = Math.max((2 * r) / p.pizza.naturalWidth, (2 * r) / p.pizza.naturalHeight);
    const w = p.pizza.naturalWidth * s, h = p.pizza.naturalHeight * s;
    ctx.drawImage(p.pizza, cx - w / 2, cy - h / 2, w, h);
    ctx.restore();
    ctx.save();
    ctx.strokeStyle = "rgba(0,0,0,.25)";
    ctx.lineWidth = 2;
    for (let i = 0; i < k; i++) ctx.stroke(new Path2D(slicePath(cx, cy, r, i, target)));
    ctx.restore();
  } else {
    const cheese = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    cheese.addColorStop(0, PIZZA_COLORS.cheeseLight);
    cheese.addColorStop(1, PIZZA_COLORS.cheese);
    for (let i = 0; i < k; i++) {
      const slice = new Path2D(slicePath(cx, cy, r, i, target));
      ctx.save();
      ctx.fillStyle = cheese;
      ctx.fill(slice);
      ctx.lineWidth = 4;
      ctx.lineJoin = "round";
      ctx.strokeStyle = PIZZA_COLORS.crust;
      ctx.stroke(slice);
      ctx.fillStyle = PIZZA_COLORS.pepperoni;
      for (const t of toppings(cx, cy, r, i, target)) {
        ctx.beginPath();
        ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  // Texts beside the pizza.
  const tx = rtl ? (W - 380) / 2 : 380 + (W - 380) / 2;
  const maxW = W - 440;
  const pad = (n: number) => String(n).padStart(2, "0");
  ctx.save();
  ctx.fillStyle = d.colors.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.font = `600 40px ${family}`;
  const title = text.title.toLocaleUpperCase();
  if (latinOnly(title)) setSpacing(ctx, 5);
  ctx.fillText(title, tx, 86, maxW);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = d.colors.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.direction = "ltr";
  ctx.font = `500 34px ${family}`;
  setSpacing(ctx, 4);
  ctx.fillText(`${pad(k)} / ${pad(target)}`, tx, 146);
  ctx.restore();
  ctx.save();
  ctx.fillStyle = full ? PIZZA_COLORS.gold : d.colors.fg;
  ctx.globalAlpha = full ? 1 : 0.9;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.font = `500 26px ${family}`;
  if (latinOnly(text.reward)) setSpacing(ctx, 3);
  ctx.fillText(text.reward, tx, 206, maxW);
  ctx.restore();
}

/** One JPEG per stamp count, 0…target, ready to upload. */
export async function makeStampBanners(design: Design, target: number): Promise<Blob[]> {
  const pictures = await loadBannerPictures(design);
  const canvas = document.createElement("canvas");
  canvas.width = BANNER_W;
  canvas.height = BANNER_H;
  const ctx = canvas.getContext("2d")!;
  const out: Blob[] = [];
  for (let s = 0; s <= target; s++) {
    ctx.clearRect(0, 0, BANNER_W, BANNER_H);
    drawStampBanner(ctx, design, pictures, s, target);
    out.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.88)));
  }
  return out;
}

// ---- Apple Wallet strip ----

/** Apple Wallet strip size (pixels, @3x) for a store card: 375×144 points. */
export const APPLE_W = 1125;
export const APPLE_H = 432;


/** The reward slot: a round gift stamp with a small tilted label under it (like the card on the web). */
function drawFreeSlot(ctx: CanvasRenderingContext2D, d: Design, p: BannerPictures, x: number, y: number, size: number, ready: boolean, label: string) {
  const color = d.look.stampStyle === "bright" ? GOLD : d.colors.stamp;
  ctx.save();
  circle(ctx, x, y, size);
  ctx.lineWidth = Math.max(2.5, size * 0.035);
  ctx.strokeStyle = color;
  if (ready) {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.stroke();
  ctx.drawImage(ready ? p.giftOnFill : p.giftOnCard, x + size * 0.25, y + size * 0.2, size * 0.5, size * 0.5);
  ctx.restore();
  // The label: a white pill with the stamp color, across the bottom of the circle.
  const family = FONTS[d.look.font].family;
  ctx.save();
  ctx.translate(x + size / 2, y + size * 0.86);
  ctx.rotate(-0.12);
  let font = Math.round(size * 0.22);
  ctx.font = `800 ${font}px ${family}`;
  while (font > 10 && ctx.measureText(label).width > size * 0.9) { font -= 1; ctx.font = `800 ${font}px ${family}`; }
  const bw = ctx.measureText(label).width + font * 0.9, bh = font * 1.45, r = bh / 2;
  ctx.beginPath();
  ctx.moveTo(-bw / 2 + r, -bh / 2);
  ctx.arcTo(bw / 2, -bh / 2, bw / 2, bh / 2, r);
  ctx.arcTo(bw / 2, bh / 2, -bw / 2, bh / 2, r);
  ctx.arcTo(-bw / 2, bh / 2, -bw / 2, -bh / 2, r);
  ctx.arcTo(-bw / 2, -bh / 2, bw / 2, -bh / 2, r);
  ctx.closePath();
  ctx.fillStyle = ready ? color : "#FFFFFF";
  ctx.fill();
  ctx.lineWidth = Math.max(2, font * 0.12);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.fillStyle = ready ? onColor(color) : color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.direction = "ltr";
  ctx.fillText(label, 0, font * 0.06);
  ctx.restore();
}

/**
 * The stamps alone, in rows of five, left to right, the reward slot last (as on wallet loyalty cards).
 * Same grid on Apple Wallet (strip) and Google Wallet (banner), sized to the picture.
 */
export function drawStampGrid(ctx: CanvasRenderingContext2D, d: Design, p: BannerPictures, stamps: number, target: number, W: number, H: number) {
  ctx.fillStyle = d.colors.bg;
  ctx.fillRect(0, 0, W, H);
  // The business's banner or background image behind the stamps, filling the picture (centre crop).
  if (p.background) {
    const img = p.background;
    const c = Math.max(W / img.naturalWidth, H / img.naturalHeight);
    const w = img.naturalWidth * c, h = img.naturalHeight * c;
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2, w, h);
  }
  const slots = target + 1;
  const perRow = slots <= 5 ? slots : slots <= 15 ? 5 : Math.ceil(slots / 3);
  const rows = Math.ceil(slots / perRow);
  // Square cells; the grid keeps a margin of about one ninth of the width on each side.
  const cell = Math.floor(Math.min((W * 0.89) / Math.max(perRow, 5), (H - 24) / rows));
  const size = Math.round(cell * 0.72);
  const gridW = cell * Math.max(perRow, 5);
  const left = (W - gridW) / 2 + (cell * (Math.max(perRow, 5) - perRow)) / 2;
  const top = (H - cell * rows) / 2;
  const label = (textsFor(d, d.langs[0]).gift || "FREE").slice(0, 12);
  for (let i = 0; i < slots; i++) {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = left + col * cell + (cell - size) / 2;
    const y = top + row * cell + (cell - size) / 2;
    if (i === target) drawFreeSlot(ctx, d, p, x, y, size, stamps >= target, label);
    else drawStamp(ctx, d, p, x, y, size, i < stamps);
  }
}

/** The Apple Wallet strip: the stamp grid (the pass shows the logo, name and counts as its own fields). */
export function drawAppleStrip(ctx: CanvasRenderingContext2D, d: Design, p: BannerPictures, stamps: number, target: number) {
  drawStampGrid(ctx, d, p, stamps, target, APPLE_W, APPLE_H);
}

/** One JPEG per stamp count, 0…target, for Apple Wallet (the server turns them into PNG). */
export async function makeAppleStrips(design: Design, target: number): Promise<Blob[]> {
  const pictures = await loadBannerPictures(design);
  const canvas = document.createElement("canvas");
  canvas.width = APPLE_W;
  canvas.height = APPLE_H;
  const ctx = canvas.getContext("2d")!;
  const out: Blob[] = [];
  for (let s = 0; s <= target; s++) {
    ctx.clearRect(0, 0, APPLE_W, APPLE_H);
    drawAppleStrip(ctx, design, pictures, s, target);
    out.push(await new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("blob"))), "image/jpeg", 0.9)));
  }
  return out;
}
