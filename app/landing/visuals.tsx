// Presentational pieces of the landing page (no state). Icons are inline stroke SVGs.
import type { CSSProperties, ReactNode } from "react";
import type { ExampleKey } from "./content";

const PATHS: Record<string, ReactNode> = {
  coffee: (<><path d="M10 2v2" /><path d="M14 2v2" /><path d="M6 2v2" /><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" /></>),
  scissors: (<><circle cx="6" cy="6" r="3" /><path d="M8.12 8.12 12 12" /><path d="M20 4 8.12 15.88" /><circle cx="6" cy="18" r="3" /><path d="M14.8 14.8 20 20" /></>),
  pizza: (<><path d="M15 11h.01" /><path d="M11 15h.01" /><path d="M16 16h.01" /><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16" /><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4" /></>),
  icecream: (<><path d="m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11" /><path d="M17 7A5 5 0 0 0 7 7" /><path d="M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4" /></>),
  star: (<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />),
  cake: (<><path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8" /><path d="M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1" /><path d="M2 21h20" /><path d="M7 8v3" /><path d="M12 8v3" /><path d="M17 8v3" /><path d="M7 4h.01" /><path d="M12 4h.01" /><path d="M17 4h.01" /></>),
  gift: (<><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13" /><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></>),
  check: (<path d="M20 6 9 17l-5-5" />),
  plus: (<><path d="M5 12h14" /><path d="M12 5v14" /></>),
  palette: (<><circle cx="13.5" cy="6.5" r=".5" /><circle cx="17.5" cy="10.5" r=".5" /><circle cx="8.5" cy="7.5" r=".5" /><circle cx="6.5" cy="12.5" r=".5" /><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" /></>),
  qr: (<><rect width="5" height="5" x="3" y="3" rx="1" /><rect width="5" height="5" x="16" y="3" rx="1" /><rect width="5" height="5" x="3" y="16" rx="1" /><path d="M21 16h-3a2 2 0 0 0-2 2v3" /><path d="M21 21v.01" /><path d="M12 7v3a2 2 0 0 1-2 2H7" /><path d="M3 12h.01" /><path d="M12 3h.01" /><path d="M12 16v.01" /><path d="M16 12h1" /><path d="M21 12v.01" /><path d="M12 21v-1" /></>),
  stamp: (<><path d="M5 22h14" /><path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z" /><path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-3-3c-1.69 0-3 1-3 3 0 2 1 2 1 3.5V13" /></>),
  repeat: (<><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="m7 22-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></>),
  chart: (<><path d="M3 3v18h18" /><path d="M18 17V9" /><path d="M13 17V5" /><path d="M8 17v-3" /></>),
  shield: (<><path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" /><path d="m9 12 2 2 4-4" /></>),
  alert: (<><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" /><path d="M12 9v4" /><path d="M12 17h.01" /></>),
  message: (<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z" />),
  menu: (<><path d="M4 6h16" /><path d="M4 12h16" /><path d="M4 18h16" /></>),
  x: (<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>),
  chevronLeft: (<path d="m15 18-6-6 6-6" />),
  chevronRight: (<path d="m9 18 6-6-6-6" />),
  arrowLeft: (<><path d="m12 19-7-7 7-7" /><path d="M19 12H5" /></>),
  arrowRight: (<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>),
  play: (<polygon points="6 3 20 12 6 21 6 3" />),
  smartphone: (<><rect width="14" height="20" x="5" y="2" rx="2" /><path d="M12 18h.01" /></>),
  users: (<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>),
  globe: (<><circle cx="12" cy="12" r="10" /><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20" /><path d="M2 12h20" /></>),
};

export function Icon({ name, size = 20, stroke = 2, className, style }: { name: keyof typeof PATHS | string; size?: number; stroke?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} style={style}>
      {PATHS[name]}
    </svg>
  );
}

export const ICON_FOR: Record<ExampleKey, string> = { cafe: "coffee", barber: "scissors", pizza: "pizza", icecream: "icecream", studio: "star", bakery: "cake" };

/** Card colours per example business. `stamp` is the colour of a filled stamp. */
export const THEMES: Record<ExampleKey, { bg: string; fg: string; sub: string; badgeBg: string; badgeFg: string; stamp: string; stampFg: string; empty: string }> = {
  cafe: { bg: "#6A4DE3", fg: "#FFFFFF", sub: "#EEE8FF", badgeBg: "#FFFFFF", badgeFg: "#6A4DE3", stamp: "#FFC84A", stampFg: "#3B2A00", empty: "rgba(255,255,255,0.6)" },
  barber: { bg: "#FFF4E6", fg: "#2A1A0A", sub: "#6B4E2E", badgeBg: "#2A1A0A", badgeFg: "#FFF4E6", stamp: "#D9622B", stampFg: "#FFF4E6", empty: "#C9A27A" },
  pizza: { bg: "#B8122E", fg: "#FFFFFF", sub: "#FFE3E8", badgeBg: "#FFFFFF", badgeFg: "#B8122E", stamp: "#FFFFFF", stampFg: "#B8122E", empty: "rgba(255,255,255,0.6)" },
  icecream: { bg: "#DDF4EC", fg: "#0E3B2E", sub: "#2D5E4F", badgeBg: "#E5689A", badgeFg: "#FFFFFF", stamp: "#E5689A", stampFg: "#FFFFFF", empty: "#7FBFA8" },
  studio: { bg: "#1F1B3A", fg: "#FFFFFF", sub: "#C9C3DE", badgeBg: "#7FE0C2", badgeFg: "#0F2A2E", stamp: "#7FE0C2", stampFg: "#0F2A2E", empty: "#6B6488" },
  bakery: { bg: "#7A4A2A", fg: "#FFF6EC", sub: "#F3DFC8", badgeBg: "#FFC84A", badgeFg: "#3B2A00", stamp: "#FFC84A", stampFg: "#3B2A00", empty: "rgba(255,246,236,0.55)" },
};

/** The fictional "קפה אייקון" logo used in examples. */
export function CafeLogo({ size = 40 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="0 0 48 48" style={{ flex: "none", display: "block" }}>
      <rect width="48" height="48" rx="14" fill="#F3EEFF" />
      <circle cx="24" cy="25" r="17" fill="#8F72E8" />
      <path d="M15 23h16v5.5a7 7 0 0 1-7 7h-2a7 7 0 0 1-7-7z" fill="#FFFFFF" />
      <path d="M31 25h1.6a3 3 0 0 1 0 6H31" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M13 38h20" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" />
      <path d="M23 21c0-3.5 2.5-5.5 2.5-11" fill="none" stroke="#3E2A8C" strokeWidth="1.6" strokeLinecap="round" />
      <ellipse cx="26.6" cy="10.6" rx="1.7" ry="1.2" fill="#FFD6F3" transform="rotate(-30 26.6 10.6)" />
      <ellipse cx="24.2" cy="12.4" rx="1.7" ry="1.2" fill="#FFD6F3" transform="rotate(30 24.2 12.4)" />
      <ellipse cx="26.2" cy="14.6" rx="1.7" ry="1.2" fill="#FFD6F3" transform="rotate(-30 26.2 14.6)" />
      <ellipse cx="23.6" cy="16.6" rx="1.7" ry="1.2" fill="#FFD6F3" transform="rotate(30 23.6 16.6)" />
    </svg>
  );
}

const QR_PATH =
  "M0 0h7v7H0zM14 0h7v7h-7zM0 14h7v7H0zM8 0h1v2H8zM10 1h2v1h-2zM9 3h2v2H9zM12 4h1v2h-1zM8 6h1v1H8zM10 6h1v1h-1zM0 8h2v1H0zM3 8h3v1H3zM8 8h2v2H8zM11 8h3v1h-3zM15 8h2v2h-2zM18 8h3v1h-3zM1 10h2v2H1zM5 10h2v1H5zM11 10h1v3h-1zM13 10h2v1h-2zM17 11h2v2h-2zM20 10h1v3h-1zM4 12h3v1H4zM8 12h2v2H8zM13 12h3v1h-3zM8 15h2v1H8zM11 14h2v2h-2zM14 14h2v1h-2zM17 14h1v2h-1zM19 15h2v1h-2zM9 17h3v1H9zM13 16h3v2h-3zM8 19h2v2H8zM11 19h1v2h-1zM14 19h3v1h-3zM18 18h1v3h-1zM20 19h1v2h-1z";

/** A decorative QR pattern (not a working code). */
export function QrArt({ size = 96 }: { size?: number }) {
  return (
    <svg aria-hidden="true" focusable="false" width={size} height={size} viewBox="-1 -1 23 23" shapeRendering="crispEdges" style={{ display: "block" }}>
      <rect x="-1" y="-1" width="23" height="23" fill="#FFFFFF" />
      <path fill="#171329" d={QR_PATH} />
      <path fill="#FFFFFF" d="M1 1h5v5H1zM15 1h5v5h-5zM1 15h5v5H1z" />
      <path fill="#171329" d="M2 2h3v3H2zM16 2h3v3h-3zM2 16h3v3H2z" />
    </svg>
  );
}

/** Loyalty card in the brand's style. `pressed` is the index of a stamp that was just added (animated). */
export function CardVisual({
  k, name, rewardLine, target, filled, footStart, footEnd, pressed, pressKey, size = "md", ready = false,
}: {
  k: ExampleKey; name: string; rewardLine: string; target: number; filled: number;
  footStart: string; footEnd: string; pressed?: number; pressKey?: number; size?: "sm" | "md" | "lg"; ready?: boolean;
}) {
  const th = THEMES[k];
  const cols = target <= 6 ? 3 : target <= 8 ? 4 : 5;
  const style = {
    "--c-bg": th.bg, "--c-fg": th.fg, "--c-sub": th.sub, "--c-badge": th.badgeBg, "--c-badge-fg": th.badgeFg,
    "--c-stamp": th.stamp, "--c-stamp-fg": th.stampFg, "--c-empty": th.empty, "--cols": cols,
  } as CSSProperties;
  return (
    <div className={`lp-card lp-card-${size}${ready ? " is-ready" : ""}`} style={style}>
      <div className="lp-card-head">
        <span className="lp-card-badge">{k === "cafe" ? <CafeLogo size={size === "sm" ? 30 : 40} /> : <Icon name={ICON_FOR[k]} size={size === "sm" ? 18 : 24} stroke={2.2} />}</span>
        <span className="lp-card-titles">
          <span className="lp-card-name">{name}</span>
          <span className="lp-card-reward">{rewardLine}</span>
        </span>
      </div>
      <div className="lp-stamps">
        {Array.from({ length: target }, (_, i) =>
          i < filled ? (
            <span key={i === pressed ? `p${pressKey}` : i} className={`lp-stamp is-on${i === pressed ? " is-new" : ""}`}>
              <Icon name={ICON_FOR[k]} stroke={2.4} className="lp-stamp-icon" />
            </span>
          ) : (
            <span key={i} className="lp-stamp" />
          ),
        )}
      </div>
      <div className="lp-card-foot">
        <span className="lp-card-count">{footStart}</span>
        <span>{footEnd}</span>
      </div>
    </div>
  );
}
