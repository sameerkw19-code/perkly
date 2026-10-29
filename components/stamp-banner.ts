// Draws the wallet "stamp banner": title, stamp count, a row of stamps and the reward line, as one picture.
// Google Wallet (and later Apple Wallet) shows a picture, not live elements, so the editor draws one
// picture per stamp count (0…target) when publishing, and the server picks the right one for each pass.
// Browser only (canvas). Drawn at the Google Wallet hero size.

import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { Gift } from "lucide-react";
import { FONTS, isRtl, onColor, textsFor, type Design, type Lang } from "../lib/design";
import { ICONS } from "./loyalty-card";

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
function iconPicture(Icon: any, color: string): Promise<Picture> {
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
  const own = icon === "image" && image ? image : icon === "logo" && design.logo ? design.logo : null;
  const bright = design.look.stampStyle === "bright";
  const giftColor = bright ? GOLD : design.colors.stamp;
  const preset = !own && icon !== "image" && icon !== "logo" ? ICONS[icon as keyof typeof ICONS] : null;
  const [filled, empty, iconOnStamp, iconOnCard, giftOnCard, giftOnFill] = await Promise.all([
    own ? loadImage(asset(own)) : Promise.resolve(null),
    own && icon === "image" && emptyImage ? loadImage(asset(emptyImage)) : Promise.resolve(null),
    preset ? iconPicture(preset, onColor(design.colors.stamp)) : Promise.resolve(null),
    preset ? iconPicture(preset, design.colors.fg) : Promise.resolve(null),
    iconPicture(Gift, giftColor),
    iconPicture(Gift, onColor(giftColor)),
  ]);
  return { filled, empty, round: icon === "logo", iconOnStamp, iconOnCard, giftOnCard, giftOnFill };
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

function drawGift(ctx: CanvasRenderingContext2D, d: Design, p: BannerPictures, x: number, y: number, size: number, ready: boolean) {
  const color = d.look.stampStyle === "bright" ? GOLD : d.colors.stamp;
  ctx.save();
  circle(ctx, x, y, size);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = color;
  if (ready) {
    ctx.fillStyle = color;
    ctx.fill();
  }
  ctx.stroke();
  ctx.drawImage(ready ? p.giftOnFill : p.giftOnCard, x + size * 0.24, y + size * 0.24, size * 0.52, size * 0.52);
  ctx.restore();
}

/** Letter spacing only for text without Hebrew or Arabic letters (it breaks Arabic joining and looks wrong in Hebrew). */
const latinOnly = (s: string) => !/[\u0590-\u06FF\u0750-\u077F\uFB1D-\uFEFC]/.test(s);

function setSpacing(ctx: CanvasRenderingContext2D, px: number) {
  // Letter spacing where the browser supports it on canvas; plain text elsewhere.
  if ("letterSpacing" in ctx) (ctx as any).letterSpacing = `${px}px`;
}

/** Draws the banner for `stamps` out of `target` in the card's first language. */
export function drawStampBanner(ctx: CanvasRenderingContext2D, d: Design, p: BannerPictures, stamps: number, target: number) {
  const lang: Lang = d.langs[0];
  const text = textsFor(d, lang);
  const rtl = isRtl(lang);
  const family = FONTS[d.look.font].family;
  const W = BANNER_W, H = BANNER_H;

  // Background: the card's color, plain (no gradient).
  ctx.fillStyle = d.colors.bg;
  ctx.fillRect(0, 0, W, H);

  // Layout: one row up to 12 slots (stamps + gift), otherwise two rows with smaller stamps.
  const slots = target + 1;
  const rows = slots > 12 ? 2 : 1;
  const perRow = Math.ceil(slots / rows);
  const gap = rows === 1 ? 16 : 10;
  const size = Math.min(rows === 1 ? 66 : 46, Math.floor((W - 120 - gap * (perRow - 1)) / perRow));
  const titleSize = rows === 1 ? 38 : 30;
  const countSize = rows === 1 ? 30 : 24;
  const rewardSize = rows === 1 ? 24 : 20;
  const rowsH = rows * size + (rows - 1) * gap;
  const blockH = titleSize + 10 + countSize + 16 + rowsH + 16 + rewardSize;
  let y = (H - blockH) / 2;

  ctx.fillStyle = d.colors.fg;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  // Title with a thin line on each side.
  ctx.save();
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.font = `600 ${titleSize}px ${family}`;
  const title = text.title.toLocaleUpperCase();
  if (latinOnly(title)) setSpacing(ctx, rows === 1 ? 6 : 4);
  const tw = Math.min(ctx.measureText(title).width, W - 260);
  ctx.fillText(title, W / 2, y, W - 260);
  ctx.globalAlpha = 0.45;
  ctx.fillRect(W / 2 - tw / 2 - 24 - 130, y + titleSize / 2, 130, 1.5);
  ctx.fillRect(W / 2 + tw / 2 + 24, y + titleSize / 2, 130, 1.5);
  ctx.restore();
  y += titleSize + 10;

  // Count, always left to right ("03 / 09").
  ctx.save();
  ctx.direction = "ltr";
  ctx.font = `500 ${countSize}px ${family}`;
  setSpacing(ctx, 4);
  const pad = (n: number) => String(n).padStart(2, "0");
  ctx.fillText(`${pad(Math.min(stamps, target))} / ${pad(target)}`, W / 2, y);
  ctx.restore();
  y += countSize + 16;

  // Stamps, filled from the start of the reading direction; the gift is the last slot.
  for (let i = 0; i < slots; i++) {
    const row = Math.floor(i / perRow);
    const inRow = Math.min(perRow, slots - row * perRow);
    const col = i % perRow;
    const rowW = inRow * size + (inRow - 1) * gap;
    const start = (W - rowW) / 2;
    const pos = rtl ? inRow - 1 - col : col;
    const x = start + pos * (size + gap);
    const sy = y + row * (size + gap);
    if (i === target) drawGift(ctx, d, p, x, sy, size, stamps >= target);
    else drawStamp(ctx, d, p, x, sy, size, i < stamps);
  }
  y += rowsH + 16;

  // Reward line.
  ctx.save();
  ctx.direction = rtl ? "rtl" : "ltr";
  ctx.font = `500 ${rewardSize}px ${family}`;
  if (latinOnly(text.reward)) setSpacing(ctx, 3);
  ctx.globalAlpha = 0.9;
  ctx.fillText(text.reward, W / 2, y, W - 120);
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
