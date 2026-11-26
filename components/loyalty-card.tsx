import {
  Bean, Beer, Cake, Coffee, Croissant, CupSoda, Gift, GlassWater, Hamburger, Heart, IceCreamCone, Martini,
  Pizza, Sandwich, Scissors, ShoppingBag, Sparkles, Star, Utensils,
  type LucideIcon,
} from "lucide-react";
import { assetUrl, cardFont, cardLang, fontHref, is3d, onColor, stamp3dUrl, textsFor, type Design, type PresetIcon } from "../lib/design";
import { translate } from "../lib/i18n";
import { HotDog } from "./hotdog-icon";
import { usesPizza } from "../lib/pizza";
import { PizzaProgress } from "./pizza-progress";
import { isRtl, type Lang } from "../lib/i18n-types";

export const ICONS: Record<PresetIcon, LucideIcon | typeof HotDog> = {
  coffee: Coffee, bean: Bean, pizza: Pizza, hotdog: HotDog, burger: Hamburger, icecream: IceCreamCone, mojito: CupSoda, beer: Beer,
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
  if (is3d(icon)) return <img className="stamp-img three-d" src={stamp3dUrl(icon)} alt="" />;
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
  const productImage = design.stamp.icon === "image" || is3d(design.stamp.icon);
  if (usesPizza(design, target)) return <div className="stamp-grid pizza"><PizzaProgress design={design} stamps={stamps} target={target} /></div>;
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
  /** The balance card: the balance as shown, the percentage back, and the owner's minimum to use it (if any). */
  balance?: { text: string; pct: string; min?: string };
  /** The "average" card: the average so far this round, and the value of a reward ready to use. */
  average?: { soFar?: string; ready?: string };
  /** The appointments card: the next appointment as shown ("יום ג׳, 25.11 · 10:30"), or null when there is none. */
  appointment?: { text: string | null; extra?: "none" | "stamps" | "points" | "cashback" };
  /** The library card: the nearest return date as shown ("יום ד׳, 3.12"), or null with no books, and how many books. */
  library?: { next: string | null; count: number };
  /** The six simpler cards (pass, gift, club, service, coupon, classes): one line instead of stamps. */
  face?: { label: string; value: string; sub: string };
};

/**
 * The average card: purchases this round as a count and a bar, what the free purchase is worth now,
 * and how many purchases are left. The same picture the wallet pass draws (lib/server/progress-strip.ts).
 */
function AverageBar({ t, stamps, target, ready, average }: { t: T; stamps: number; target: number; ready: boolean; average: { soFar?: string; ready?: string } }) {
  const done = Math.min(stamps, target);
  const left = Math.max(0, target - stamps);
  const worth = average.ready ?? average.soFar;
  return (
    <div className="pcard-avgbar">
      <div className="pcard-fields">
        <div className="pcard-field">
          <small>{t("avgRoundWord")}</small>
          <b className="pcard-avg-count" dir="ltr"><span>{done}</span><em> / {target}</em></b>
        </div>
        {worth && (
          <div className="pcard-field pcard-end">
            <small>{average.ready ? t("avgReadyWord") : t("avgWorthNow")}</small>
            <b><Num>{worth}</Num></b>
          </div>
        )}
      </div>
      <div className="pcard-bar" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={done} aria-label={t("avgRoundWord")}>
        <i style={{ width: `${(done / target) * 100}%` }} />
      </div>
      <p className="pcard-hint">
        {average.ready || ready
          ? (average.ready ? t("avgCardReady", { amount: average.ready }) : t("earnedShort"))
          : left === 1 ? t("avgToGoOne", { n: target + 1 }) : t("avgToGo", { k: left, n: target + 1 })}
      </p>
      <p className="pcard-hint pcard-avg">{t("avgCardHint")}</p>
    </div>
  );
}

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
  const kind = (design.stamp.icon === "image" && design.stamp.image) || is3d(design.stamp.icon) ? "photo" : "mark";
  // The business's own picture for an empty stamp, when it uploaded one.
  const ownEmpty = !filled && kind === "photo" && design.stamp.emptyImage;
  return (
    <span className={`pcard-stamp ${kind} ${filled ? "is-filled" : "is-empty"}${ownEmpty ? " own-empty" : ""}`} aria-hidden="true">
      {ownEmpty ? <img className="stamp-img" src={assetUrl(design.stamp.emptyImage!)!} alt="" /> : <StampMark design={design} size={22} />}
    </span>
  );
}

/**
 * Customer card, wallet-pass style. Order (reading direction follows the page language):
 * brand and customer name, reward line, stamp grid, two fields (stamps, rewards), optional QR.
 */
export function LoyaltyCard({ face, design, lang, stamps, target, customerName, rewards, qr, balance, average, appointment, library }: Props) {
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
    <div className={`pcard layout-${design.layout} stamps-${design.look.stamps} stamp-${design.look.stampStyle}${ready ? " is-ready" : ""}`} style={lookStyle(design, cl)} dir={isRtl(cl) ? "rtl" : "ltr"} lang={cl}>
      <FontLink design={design} lang={cl} />
      <div className="pcard-head">
        <div className="pcard-brand">
          {design.logo ? (
            <div className={`pcard-logo-row frame-${design.look.logoFrame ?? "none"}`}>
              <span className="pcard-logo-wrap">
                <img className="pcard-logo" src={assetUrl(design.logo)!} alt={design.look.logoName ? "" : text.title} />
              </span>
              {design.look.logoName && design.showTitle && <strong className="pcard-title">{text.title}</strong>}
            </div>
          ) : (
            design.showTitle && <strong className="pcard-title">{text.title}</strong>
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

      {appointment && (
        <div className="pcard-balance pcard-appt">
          <small>{t("apptWord")}</small>
          <b><Num>{appointment.text ?? t("apptNone")}</Num></b>
          <p className="pcard-hint">{t(appointment.text ? "apptCardHint" : "apptCardNoneHint")}</p>
        </div>
      )}
      {face && (
        <div className="pcard-balance pcard-appt">
          <small>{face.label}</small>
          <b><Num>{face.value}</Num></b>
          {face.sub && <p className="pcard-hint">{face.sub}</p>}
        </div>
      )}
      {library && (
        <div className="pcard-balance pcard-appt">
          <small>{t("libReturnBy")}</small>
          <b><Num>{library.next ?? t("libNoBooksCard")}</Num></b>
          <p className="pcard-hint">{library.count === 1 ? t("libCardHintOne") : library.count ? t("libCardHint", { n: library.count }) : t("libCardNoneHint")}</p>
        </div>
      )}
      {/* The appointments card shows its add-on (if any) below the appointment: points, a punch card or the balance. */}
      {library || face ? null : appointment && (!appointment.extra || appointment.extra === "none") ? null : appointment?.extra === "points" ? (
        <div className="pcard-points">
          <div className="pcard-fields">
            <div className="pcard-field"><small>{t("pointsWord")}</small><b><Num>{Math.min(stamps, target)}/{target}</Num></b></div>
            {!!rewards && <div className="pcard-field pcard-end"><small>{t("rewardsWord")}</small><b><Num>{rewards}</Num></b></div>}
          </div>
          <div className="pcard-pointsbar" aria-hidden="true"><i style={{ width: `${Math.min(100, (stamps / target) * 100)}%` }} /></div>
        </div>
      ) : balance ? (
        <div className="pcard-balance">
          <small>{t("balanceWord")}</small>
          <b><Num>{balance.text}</Num></b>
          <p className="pcard-hint">{t("cbCardHint", { pct: balance.pct })}{balance.min ? " " + t("cbCardMin", { min: balance.min }) : ""}</p>
        </div>
      ) : average ? (
        <AverageBar t={t} stamps={stamps} target={target} ready={ready} average={average} />
      ) : <>
      {usesPizza(design, target) ? (
        <div className="pcard-pizza"><PizzaProgress design={design} stamps={stamps} target={target} /></div>
      ) : (
        <div className="pcard-stamps" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: target }, (_, i) => (
            <PassStamp key={i} design={design} filled={i < stamps} />
          ))}
          <span className={"pcard-stamp gift" + (ready ? " is-filled" : "")} aria-hidden="true">
            <Gift size={20} />
            {text.gift && <em>{text.gift}</em>}
          </span>
        </div>
      )}

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
      <p className="sr-only">{t("stampsOf", { n: stamps, t: target })}</p>
      </>}

      {qr && <div className="pcard-qr">{qr}</div>}
      {/* Shown on every card, for all plans. A link only on the customer's own card (previews stay plain). */}
      {qr ? (
        <a className="pcard-powered" href="https://perkly.shop/?ref=card" target="_blank" rel="noopener" dir="ltr">Powered by <b>Perkly</b></a>
      ) : (
        <span className="pcard-powered" dir="ltr">Powered by <b>Perkly</b></span>
      )}
    </div>
  );
}

/** The Apple Wallet strip of the average card: the count over a progress bar (the pass draws the bar as a picture). */
function StripBar({ design, stamps, target, label }: { design: Design; stamps: number; target: number; label: string }) {
  const done = Math.min(stamps, target);
  return (
    <div className="ap-avg">
      <small>{label}</small>
      <b dir="ltr"><span>{done}</span><em> / {target}</em></b>
      <div className="pcard-bar" style={{ "--c-st": design.colors.stamp } as React.CSSProperties}><i style={{ width: `${(done / target) * 100}%` }} /></div>
    </div>
  );
}

/** Approximate Apple Wallet store card: logo + header field, strip image with stamps, fields, code. */
export function ApplePreview({ face, design, lang, stamps, target, customerName, balance, average, appointment, library }: Props) {
  const cl = cardLang(design, lang);
  const t: T = (key, vars) => translate(cl, key, vars);
  const text = textsFor(design, cl);
  const label = { color: `color-mix(in srgb, ${design.colors.fg} 70%, transparent)` };
  // Same layout as the real pass (lib/server/apple-wallet.ts): logo and name, the stamp grid, stamps and rewards ready.
  const ready = stamps >= target ? 1 : 0;
  return (
    <div className="wallet apple" dir={isRtl(cl) ? "rtl" : "ltr"} lang={cl} style={{ ...cardStyle(design), background: design.colors.bg, color: design.colors.fg }}>
      <div className="ap-top">
        <div className="ap-logo">{design.logo ? <Logo design={design} title={text.title} className="card-logo small" /> : design.showTitle && <b>{text.title}</b>}</div>
        {average
          ? (average.ready ?? average.soFar) && <div className="ap-f"><small style={label}>{average.ready ? t("avgReadyWord") : t("avgWorthNow")}</small><b><Num>{(average.ready ?? average.soFar)!}</Num></b></div>
          : design.showCustomerName && customerName && <div className="ap-f"><small style={label}>{t("customerName")}</small><b>{customerName}</b></div>}
      </div>
      {/* The balance card's strip is the banner image (no stamp grid), and its field is the balance. */}
      <div className="ap-strip" style={(balance || appointment || library || face) && (design.walletHero ?? design.hero) ? { backgroundImage: `url(${assetUrl((design.walletHero ?? design.hero)!)})`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
        {average ? <StripBar design={design} stamps={stamps} target={target} label={t("avgRoundWord")} />
          : !balance && !appointment && !library && !face && <StampGrid design={design} stamps={stamps} target={target} giftLabel={text.gift} />}
      </div>
      <div className="ap-row">
        {face ? (
          <>
            <div><small style={label}>{face.label}</small><b><Num>{face.value}</Num></b></div>
            {face.sub && <div className="end"><small style={label}>&nbsp;</small><b style={{ fontSize: 12, fontWeight: 500 }}>{face.sub}</b></div>}
          </>
        ) : library ? (
          <>
            <div><small style={label}>{t("libReturnBy")}</small><b><Num>{library.next ?? t("libNoBooksCard")}</Num></b></div>
            <div className="end"><small style={label}>{t("books")}</small><b><Num>{library.count}</Num></b></div>
          </>
        ) : appointment ? (
          <div><small style={label}>{t("apptWord")}</small><b><Num>{appointment.text ?? t("apptNone")}</Num></b></div>
        ) : average ? (
          <>
            {design.showCustomerName && customerName && <div><small style={label}>{t("customerName")}</small><b>{customerName}</b></div>}
            <div className="end"><small style={label}>{t("reward")}</small><b>{text.reward}</b></div>
          </>
        ) : balance ? (
          <div><small style={label}>{t("balanceWord")}</small><b><Num>{balance.text}</Num></b></div>
        ) : (
          <>
            <div><small style={label}>{t("stampsWord")}</small><b><Num>{stamps}/{target}</Num></b></div>
            <div className="end"><small style={label}>{t("rewardsWord")}</small><b><Num>{ready}</Num></b></div>
          </>
        )}
      </div>
      <div className="fake-qr">QR</div>
    </div>
  );
}

/** Approximate Google Wallet loyalty card: round logo, fixed header, rows, code, hero image. */
export function GooglePreview({ face, design, lang, stamps, target, customerName, balance, average, appointment, library }: Props) {
  const cl = cardLang(design, lang);
  const t: T = (key, vars) => translate(cl, key, vars);
  const text = textsFor(design, cl);
  const banner = design.walletHero ?? design.hero;
  const fg = onColor(design.colors.bg);
  return (
    <div className="wallet google" dir={isRtl(cl) ? "rtl" : "ltr"} lang={cl} style={{ ...cardStyle(design), background: design.colors.bg, color: fg, ...({ "--c-fg": fg } as React.CSSProperties) }}>
      <div className="gw-body">
        <div className="gw-h"><Logo design={design} title={text.title} className="card-logo round" /><span>{text.title}</span></div>
        <div className="gw-title">{text.subtitle}</div>
        {text.promo && <div className="gw-promo">{text.promo}</div>}
        <div className="gw-row">
          {design.showCustomerName && customerName && <div><small>{t("customerName")}</small><b>{customerName}</b></div>}
          {face
            ? <div><small>{face.label}</small><b><Num>{face.value}</Num></b></div>
            : library
            ? <><div><small>{t("libReturnBy")}</small><b><Num>{library.next ?? t("libNoBooksCard")}</Num></b></div><div><small>{t("books")}</small><b><Num>{library.count}</Num></b></div></>
            : appointment
            ? <div><small>{t("apptWord")}</small><b><Num>{appointment.text ?? t("apptNone")}</Num></b></div>
            : balance
            ? <div><small>{t("balanceWord")}</small><b><Num>{balance.text}</Num></b></div>
            : <div><small>{average ? t("avgRoundWord") : t("stampsWord")}</small><b><Num>{stamps}/{target}</Num></b></div>}
          {average && (average.ready ?? average.soFar) && <div><small>{average.ready ? t("avgReadyWord") : t("avgWorthNow")}</small><b><Num>{(average.ready ?? average.soFar)!}</Num></b></div>}
          <div><small>{t("reward")}</small><b>{text.reward}</b></div>
        </div>
        <div className="fake-qr">QR</div>
      </div>
      <div className="gw-hero" style={banner ? { backgroundImage: `url(${assetUrl(banner)})` } : undefined}>
        {!balance && !average && !appointment && !library && !face && <StampGrid design={design} stamps={stamps} target={target} giftLabel={text.gift} />}
      </div>
    </div>
  );
}
