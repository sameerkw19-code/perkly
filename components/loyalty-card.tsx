import {
  Beer, Cake, Coffee, Croissant, CupSoda, Gift, GlassWater, Hamburger, Heart, IceCreamCone, Martini,
  Pizza, Sandwich, Scissors, ShoppingBag, Sparkles, Star, Utensils,
} from "lucide-react";
import { assetUrl, onColor, textsFor, type Design, type PresetIcon } from "../lib/design";
import type { Lang } from "../lib/i18n-types";

export const ICONS: Record<PresetIcon, any> = {
  coffee: Coffee, pizza: Pizza, burger: Hamburger, icecream: IceCreamCone, mojito: CupSoda, beer: Beer,
  shot: GlassWater, cocktail: Martini, sandwich: Sandwich, croissant: Croissant, cake: Cake, utensils: Utensils,
  scissors: Scissors, bag: ShoppingBag, sparkle: Sparkles, heart: Heart, star: Star,
};

/** Numbers like "3/9" must keep left-to-right order inside Hebrew/Arabic text. */
export function Num({ children }: { children: React.ReactNode }) {
  return <bdi dir="ltr" style={{ unicodeBidi: "isolate", fontVariantNumeric: "tabular-nums" }}>{children}</bdi>;
}

type T = (key: string, vars?: Record<string, string | number>) => string;

export function StampMark({ design, size = 20 }: { design: Design; size?: number }) {
  const { icon, image } = design.stamp;
  if (icon === "logo" && design.logo) return <img className="stamp-img round" src={assetUrl(design.logo)!} alt="" />;
  if (icon === "image" && image) return <img className="stamp-img" src={assetUrl(image)!} alt="" />;
  const Icon = ICONS[icon as PresetIcon] ?? Star;
  return <Icon size={size} />;
}

export function Logo({ design, title, className = "card-logo" }: { design: Design; title: string; className?: string }) {
  return design.logo ? (
    <img className={className + " has-img"} src={assetUrl(design.logo)!} alt="" />
  ) : (
    <span className={className} aria-hidden="true">{(title || "?").trim().charAt(0)}</span>
  );
}

/** The stamp grid, shared by the browser card and the wallet previews. */
export function StampGrid({ design, stamps, target, giftLabel }: { design: Design; stamps: number; target: number; giftLabel: string }) {
  const total = target + 1;
  const columns = total <= 6 ? total : Math.ceil(total / 2);
  const productImage = design.stamp.icon === "image";
  return (
    <div className={"stamp-grid" + (productImage ? " product" : "")} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
      {Array.from({ length: target }, (_, i) => (
        <span key={i} className={"stamp" + (i < stamps ? " filled" : " empty")} aria-hidden="true">
          <StampMark design={design} />
        </span>
      ))}
      <span className={"stamp gift" + (stamps >= target ? " filled" : "")} aria-hidden="true">
        <Gift size={18} />
        {giftLabel && <em className="gift-label">{giftLabel}</em>}
      </span>
    </div>
  );
}

type Props = {
  design: Design;
  lang: Lang;
  stamps: number;
  target: number;
  customerName?: string | null;
  t: T;
};

export function cardStyle(design: Design): React.CSSProperties {
  return {
    "--c-bg": design.colors.bg,
    "--c-fg": design.colors.fg,
    "--c-st": design.colors.stamp,
    "--c-st-ink": onColor(design.colors.stamp),
    ...(design.layout === "photo" && design.hero ? { "--c-hero": `url(${assetUrl(design.hero)})` } : {}),
  } as React.CSSProperties;
}

/** Customer card as shown in the browser. */
export function LoyaltyCard({ design, lang, stamps, target, customerName, t }: Props) {
  const text = textsFor(design, lang);
  const ready = stamps >= target;
  return (
    <div className={`loyalty-card layout-${design.layout}`} style={cardStyle(design)}>
      <div className="card-top">
        <Logo design={design} title={text.title} />
        <div className="card-name">
          <strong>{text.title}</strong>
          {text.subtitle && <small>{text.subtitle}</small>}
        </div>
        {design.showCustomerName && customerName ? (
          <span className="card-customer"><small>{t("customerName")}</small><b>{customerName}</b></span>
        ) : null}
      </div>
      <div className="card-title">{text.reward}</div>
      <div className="card-progress">
        <span><Num>{stamps}/{target}</Num></span>
        <span>{ready ? t("earnedShort") : t("toGo", { k: Math.max(0, target - stamps) })}</span>
      </div>
      <StampGrid design={design} stamps={stamps} target={target} giftLabel={text.gift} />
      <p className="sr-only">{t("stampsOf", { n: stamps, t: target })}</p>
    </div>
  );
}

/** Approximate Apple Wallet store card: logo + header field, strip image with stamps, fields, code. */
export function ApplePreview({ design, lang, stamps, target, customerName, t }: Props) {
  const text = textsFor(design, lang);
  const label = { color: `color-mix(in srgb, ${design.colors.fg} 70%, transparent)` };
  return (
    <div className="wallet apple" style={{ ...cardStyle(design), background: design.colors.bg, color: design.colors.fg }}>
      <div className="ap-top">
        <div className="ap-logo"><Logo design={design} title={text.title} className="card-logo small" /><b>{text.title}</b></div>
        {design.showCustomerName && customerName && <div className="ap-f"><small style={label}>{t("customerName")}</small><b>{customerName}</b></div>}
      </div>
      <div className="ap-strip" style={design.hero ? { backgroundImage: `linear-gradient(color-mix(in srgb, ${design.colors.bg} 50%, transparent), color-mix(in srgb, ${design.colors.bg} 50%, transparent)), url(${assetUrl(design.hero)})` } : undefined}>
        <StampGrid design={design} stamps={stamps} target={target} giftLabel={text.gift} />
      </div>
      <div className="ap-row">
        <div><small style={label}>{t("stampsWord")}</small><b><Num>{stamps}/{target}</Num></b></div>
        <div className="end"><small style={label}>{t("reward")}</small><b>{text.reward}</b></div>
      </div>
      <div className="fake-qr">QR</div>
    </div>
  );
}

/** Approximate Google Wallet loyalty card: round logo, fixed header, rows, code, hero image. */
export function GooglePreview({ design, lang, stamps, target, customerName, t }: Props) {
  const text = textsFor(design, lang);
  const fg = onColor(design.colors.bg);
  return (
    <div className="wallet google" style={{ ...cardStyle(design), background: design.colors.bg, color: fg, ["--c-fg" as any]: fg }}>
      <div className="gw-body">
        <div className="gw-h"><Logo design={design} title={text.title} className="card-logo round" /><span>{text.title}</span></div>
        <div className="gw-title">{text.subtitle || t("loyaltyCard")}</div>
        <div className="gw-row">
          {design.showCustomerName && customerName && <div><small>{t("customerName")}</small><b>{customerName}</b></div>}
          <div><small>{t("stampsWord")}</small><b><Num>{stamps}/{target}</Num></b></div>
          <div><small>{t("reward")}</small><b>{text.reward}</b></div>
        </div>
        <div className="fake-qr">QR</div>
      </div>
      <div className="gw-hero" style={design.hero ? { backgroundImage: `url(${assetUrl(design.hero)})` } : undefined}>
        <StampGrid design={design} stamps={stamps} target={target} giftLabel={text.gift} />
      </div>
    </div>
  );
}
