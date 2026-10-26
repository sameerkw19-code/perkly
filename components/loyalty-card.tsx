import {
  Beer, Cake, Coffee, Croissant, CupSoda, Gift, GlassWater, Hamburger, Heart, IceCreamCone, Martini,
  Pizza, Sandwich, Scissors, ShoppingBag, Sparkles, Star, Utensils,
} from "lucide-react";
import { assetUrl, cardFont, cardLang, fontHref, onColor, textsFor, type Design, type PresetIcon } from "../lib/design";
import { translate } from "../lib/i18n";
import { isRtl, type Lang } from "../lib/i18n-types";

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
export function StampGrid({ design, stamps, target, giftLabel, ready }: { design: Design; stamps: number; target: number; giftLabel: string; ready?: boolean }) {
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
      <span className={"stamp gift" + ((ready ?? stamps >= target) ? " filled" : "")} aria-hidden="true">
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
  /** Rewards available now (saved rewards, or a full card in redeem-first mode). */
  rewards?: number;
  t: T;
  /** Optional QR shown inside the card (customer card page only). */
  qr?: React.ReactNode;
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

const TEXT_SCALE = { s: 0.9, m: 1, l: 1.14 } as const;
const STAMP_SIZE = { s: "44px", m: "56px", l: "68px" } as const;
const GRADIENT_ANGLE = { down: "180deg", diag: "150deg", side: "90deg" } as const;
const GRADIENT_ANGLE_RTL = { down: "180deg", diag: "210deg", side: "270deg" } as const;

/** Extra variables for the wallet-style card: gradient, photo overlay, font and sizes. */
function lookStyle(design: Design, lang: Lang): React.CSSProperties {
  const look = design.look;
  // Right-to-left cards (Hebrew, Arabic) mirror sideways gradients, so the main color sits behind the logo and title.
  const rtl = isRtl(cardLang(design, lang));
  const fill = look.dir === "radial"
    ? `radial-gradient(120% 120% at 50% 0%, ${design.colors.bg} 0%, ${look.bg2} 100%)`
    : `linear-gradient(${rtl ? GRADIENT_ANGLE_RTL[look.dir] : GRADIENT_ANGLE[look.dir]}, ${design.colors.bg} 0%, ${look.bg2} 100%)`;
  return {
    ...cardStyle(design),
    "--c-bg2": look.bg2,
    "--c-fill": fill,
    "--c-ov": `${look.overlay}%`,
    "--c-font": cardFont(look.font, lang).family,
    "--c-ts": TEXT_SCALE[look.text],
    "--c-ss": STAMP_SIZE[look.stamps],
    "--c-logo": (look.logoSize ?? 100) / 100,
  } as React.CSSProperties;
}

/** Loads the card font (and a Hebrew or Arabic partner font when needed). Browsers accept a stylesheet link anywhere in the page. */
function FontLink({ design, lang }: { design: Design; lang: Lang }) {
  const cl = cardLang(design, lang);
  const hrefs = [fontHref(design.look.font), ...(cardFont(design.look.font, cl).extra ? [fontHref(cardFont(design.look.font, cl).extra!)] : [])].filter(Boolean) as string[];
  return <>{hrefs.map((h) => <link key={h} rel="stylesheet" href={h} />)}</>;
}

/** One stamp slot. Empty slots show the same mark, dimmed. */
function PassStamp({ design, filled }: { design: Design; filled: boolean }) {
  const kind = design.stamp.icon === "image" && design.stamp.image ? "photo" : "mark";
  return (
    <span className={`pcard-stamp ${kind} ${filled ? "is-filled" : "is-empty"}`} aria-hidden="true">
      <StampMark design={design} size={22} />
    </span>
  );
}

/**
 * Customer card, wallet-pass style. Order (reading direction follows the page language):
 * brand and customer name, reward line, stamp grid, two fields (stamps, rewards), optional QR.
 */
export function LoyaltyCard({ design, lang, stamps, target, customerName, rewards, qr }: Props) {
  // The card speaks the language it is shown in (one the business picked), not the visitor's site language.
  const cl = cardLang(design, lang);
  const t: T = (key, vars) => translate(cl, key, vars);
  const text = textsFor(design, cl);
  const available = rewards ?? (stamps >= target ? 1 : 0);
  const ready = available > 0;
  const full = stamps >= target;
  const total = target + 1;
  const columns = total <= 6 ? total : Math.ceil(total / 2);
  const showName = design.showCustomerName && !!customerName;
  return (
    <div className={`pcard layout-${design.layout} stamps-${design.look.stamps}${ready ? " is-ready" : ""}`} style={lookStyle(design, cl)} dir={isRtl(cl) ? "rtl" : "ltr"} lang={cl}>
      <FontLink design={design} lang={cl} />
      <div className="pcard-head">
        <div className="pcard-brand">
          {design.logo ? (
            <div className={`pcard-logo-row frame-${design.look.logoFrame ?? "none"}`}>
              <span className="pcard-logo-wrap">
                <img className="pcard-logo" src={assetUrl(design.logo)!} alt={design.look.logoName ? "" : text.title} />
              </span>
              {design.look.logoName && <strong className="pcard-title">{text.title}</strong>}
            </div>
          ) : (
            <strong className="pcard-title">{text.title}</strong>
          )}
          {text.subtitle && <small className="pcard-sub">{text.subtitle}</small>}
        </div>
        {showName && (
          <div className="pcard-field pcard-end">
            <b className="pcard-name">{customerName}</b>
          </div>
        )}
      </div>

      <div className="pcard-reward">{text.reward}</div>

      <div className="pcard-stamps" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: target }, (_, i) => (
          <PassStamp key={i} design={design} filled={i < stamps} />
        ))}
        <span className={"pcard-stamp gift" + (ready ? " is-filled" : "")} aria-hidden="true">
          <Gift size={20} />
          {text.gift && <em>{text.gift}</em>}
        </span>
      </div>

      <div className="pcard-fields">
        <div className="pcard-field">
          <small>{t("stampsWord")}</small>
          <b><Num>{stamps}/{target}</Num></b>
        </div>
        <div className="pcard-field pcard-end">
          <small>{t("rewardsWord")}</small>
          <b><Num>{available}</Num></b>
        </div>
      </div>
      <p className="pcard-hint">{full || ready ? t("earnedShort") : t("toGo", { k: Math.max(0, target - stamps) })}</p>

      {qr && <div className="pcard-qr">{qr}</div>}
      <p className="sr-only">{t("stampsOf", { n: stamps, t: target })}</p>
      {/* Shown on every card, for all plans. A link only on the customer's own card (previews stay plain). */}
      {qr ? (
        <a className="pcard-powered" href="https://perkly.shop/?ref=card" target="_blank" rel="noopener" dir="ltr">Powered by <b>Perkly</b></a>
      ) : (
        <span className="pcard-powered" dir="ltr">Powered by <b>Perkly</b></span>
      )}
    </div>
  );
}

/** Approximate Apple Wallet store card: logo + header field, strip image with stamps, fields, code. */
export function ApplePreview({ design, lang, stamps, target, customerName }: Props) {
  const cl = cardLang(design, lang);
  const t: T = (key, vars) => translate(cl, key, vars);
  const text = textsFor(design, cl);
  const banner = design.walletHero ?? design.hero;
  const label = { color: `color-mix(in srgb, ${design.colors.fg} 70%, transparent)` };
  return (
    <div className="wallet apple" dir={isRtl(cl) ? "rtl" : "ltr"} lang={cl} style={{ ...cardStyle(design), background: design.colors.bg, color: design.colors.fg }}>
      <div className="ap-top">
        <div className="ap-logo"><Logo design={design} title={text.title} className="card-logo small" /><b>{text.title}</b></div>
        {design.showCustomerName && customerName && <div className="ap-f"><small style={label}>{t("customerName")}</small><b>{customerName}</b></div>}
      </div>
      <div className="ap-strip" style={banner ? { backgroundImage: `linear-gradient(color-mix(in srgb, ${design.colors.bg} 50%, transparent), color-mix(in srgb, ${design.colors.bg} 50%, transparent)), url(${assetUrl(banner)})` } : undefined}>
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
export function GooglePreview({ design, lang, stamps, target, customerName }: Props) {
  const cl = cardLang(design, lang);
  const t: T = (key, vars) => translate(cl, key, vars);
  const text = textsFor(design, cl);
  const banner = design.walletHero ?? design.hero;
  const fg = onColor(design.colors.bg);
  return (
    <div className="wallet google" dir={isRtl(cl) ? "rtl" : "ltr"} lang={cl} style={{ ...cardStyle(design), background: design.colors.bg, color: fg, ["--c-fg" as any]: fg }}>
      <div className="gw-body">
        <div className="gw-h"><Logo design={design} title={text.title} className="card-logo round" /><span>{text.title}</span></div>
        <div className="gw-title">{text.subtitle}</div>
        <div className="gw-row">
          {design.showCustomerName && customerName && <div><small>{t("customerName")}</small><b>{customerName}</b></div>}
          <div><small>{t("stampsWord")}</small><b><Num>{stamps}/{target}</Num></b></div>
          <div><small>{t("reward")}</small><b>{text.reward}</b></div>
        </div>
        <div className="fake-qr">QR</div>
      </div>
      <div className="gw-hero" style={banner ? { backgroundImage: `url(${assetUrl(banner)})` } : undefined}>
        <StampGrid design={design} stamps={stamps} target={target} giftLabel={text.gift} />
      </div>
    </div>
  );
}
