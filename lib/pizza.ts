// Pizza progress: the pizza gains one slice per stamp. Shared geometry for the web card (SVG)
// and the wallet banner (canvas, through Path2D). No imports from the browser, so tests can load it.
import type { Design } from "./design";

/** Above this many stamps the slices get too thin, so the card shows stamps instead. */
export const PIZZA_MAX = 12;

export function usesPizza(d: Design, target: number): boolean {
  return d.look.progress === "pizza" && target >= 2 && target <= PIZZA_MAX;
}

/** Slice i of n as an SVG path, clockwise from 12 o'clock. */
export function slicePath(cx: number, cy: number, r: number, i: number, n: number): string {
  const a0 = -Math.PI / 2 + (2 * Math.PI * i) / n;
  const a1 = -Math.PI / 2 + (2 * Math.PI * (i + 1)) / n;
  const p = (a: number) => `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  return `M${cx},${cy} L${p(a0)} A${r},${r} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${p(a1)} Z`;
}

/** The first `k` slices of n as one path (for clipping a photo). */
export function slicesPath(cx: number, cy: number, r: number, k: number, n: number): string {
  return Array.from({ length: Math.min(k, n) }, (_, i) => slicePath(cx, cy, r, i, n)).join(" ");
}

/** Pepperoni spots for slice i of n: two per slice, at fixed places so every picture matches. */
export function toppings(cx: number, cy: number, r: number, i: number, n: number): { x: number; y: number; r: number }[] {
  const mid = -Math.PI / 2 + (2 * Math.PI * (i + 0.5)) / n;
  const spread = Math.PI / n / 2.2;
  const spot = r * (n > 8 ? 0.07 : 0.09);
  return [
    { x: cx + r * 0.66 * Math.cos(mid - spread), y: cy + r * 0.66 * Math.sin(mid - spread), r: spot },
    { x: cx + r * 0.4 * Math.cos(mid + spread * 0.6), y: cy + r * 0.4 * Math.sin(mid + spread * 0.6), r: spot },
  ];
}

export const PIZZA_COLORS = { cheese: "#F7C55A", cheeseLight: "#FFE08A", crust: "#C8741C", pepperoni: "#B3261E", gold: "#F5C542" };
