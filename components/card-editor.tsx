"use client";
import { useMemo, useState } from "react";
import { ImagePlus, Lock, MessageCircle, Shuffle, Trash2, UploadCloud } from "lucide-react";
import {
  FONTS, FONT_SCRIPTS, GRADIENTS, GRADIENT_DIRS, IMAGE_MIN, LIMITS, OFFERED_CARD_LANGS, PALETTES, STAMP_ICONS, cardLang, darken, designChecks,
  type AssetMeta, type CardLook, type Design, type FontId, type Layout, type LogoFrame, type Size, type StampIcon, type Texts,
} from "../lib/design";
import { CARD_LANGS, isRtl, type Lang } from "../lib/i18n-types";
import { errorText, translate } from "../lib/i18n";
import { post } from "../lib/api";
import { ApplePreview, GooglePreview, ICONS, LoyaltyCard, Num } from "./loyalty-card";
import { PERKLY_SOCIAL } from "../lib/perkly-social";

type Image = AssetMeta & { kind: string };
type Editor = { draft: Design; publishedVersion: number; publishedAt: string | null; hasUnpublished: boolean; images: Image[] };
type T = (key: string, vars?: Record<string, string | number>) => string;

const MAX_SIDE = { logo: 660, hero: 1200, wallet: 1100, stamp: 400 } as const;
// Keep in step with MAX_BYTES in app/api/asset/route.ts (800 KB), with a margin for the request.
const UPLOAD_CAP = 780_000;
const SIZES: Size[] = ["s", "m", "l"];
/** All selectable Google Fonts in one request, so the font buttons preview in their own face. */
const ALL_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  Object.values(FONTS).flatMap((f) => (f.google ? [`family=${f.google}`] : [])).join("&") +
  "&display=swap";
const pick = <T,>(list: readonly T[]): T => list[Math.floor(Math.random() * list.length)];

/**
 * Makes a plain white (or near-white) background transparent: flood fill from the edges, so white
 * parts inside the logo stay. Soft edges get partial transparency. Does nothing if the corners
 * aren't white or the image already has transparency.
 */
function clearWhiteBackground(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  const whiteness = (i: number) => Math.min(px[i], px[i + 1], px[i + 2]);
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + w - 1) * 4];
  if (corners.some((i) => px[i + 3] < 250 || whiteness(i) < 235)) return;
  const HARD = 238; // at least this white: fully transparent
  const SOFT = 200; // between SOFT and HARD: edge pixels fade
  const seen = new Uint8Array(w * h);
  const stack: number[] = [];
  for (let x = 0; x < w; x++) stack.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) stack.push(y * w, y * w + w - 1);
  while (stack.length) {
    const p = stack.pop()!;
    if (seen[p]) continue;
    seen[p] = 1;
    const i = p * 4;
    const wv = whiteness(i);
    if (wv < SOFT) continue;
    if (wv < HARD) { px[i + 3] = Math.round(((HARD - wv) / (HARD - SOFT)) * px[i + 3]); continue; }
    px[i + 3] = 0;
    const x = p % w;
    if (x > 0) stack.push(p - 1);
    if (x < w - 1) stack.push(p + 1);
    if (p >= w) stack.push(p - w);
    if (p < w * (h - 1)) stack.push(p + w);
  }
  ctx.putImageData(data, 0, 0);
}

/**
 * Shrinks an image in the browser before upload (WebP keeps transparency).
 * Background images go up as JPEG, because Google Wallet shows them as the card banner and does not take WebP.
 */
async function shrink(file: File, maxSide: number, type: "image/webp" | "image/jpeg" | "image/png" = "image/webp", clearWhite = false): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    const ctx = canvas.getContext("2d")!;
    if (type === "image/jpeg") { ctx.fillStyle = "#FFFFFF"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if (clearWhite && type !== "image/jpeg") clearWhiteBackground(ctx, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.86));
    // Some browsers can't write WebP and silently return PNG; both are accepted.
    return blob ?? (await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j()), "image/png")));
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A small "with subscription" tag on design options that free-tier businesses can't use. */
function PaidTag({ t }: { t: T }) {
  return <span className="paid-tag"><Lock size={11} aria-hidden="true" />{t("paidTag")}</span>;
}

export function CardEditor({ businessId, target, editor, t, lang, notify, reload, paid = true, upgradeHref, setup }: {
  businessId: string; target: number; editor: Editor; t: T; lang: Lang;
  notify: (s: string, bad?: boolean) => void; reload: () => void;
  /** Logo, background image and stamp image need a subscription (see hasPaidDesign). */
  paid?: boolean; upgradeHref?: string;
  /** In the sign-up flow: publish without asking, with the flow's own button text. */
  setup?: { publishLabel: string };
}) {
  const [design, setDesign] = useState<Design>(editor.draft);
  const [saved, setSaved] = useState(JSON.stringify(editor.draft));
  const [images, setImages] = useState<Image[]>(editor.images);
  const [pickedLang, setTextLang] = useState<Lang>(() => cardLang(editor.draft, lang));
  const [tab, setTab] = useState<"web" | "apple" | "google">("web");
  const [demo, setDemo] = useState(Math.min(3, target));
  const [busy, setBusy] = useState("");
  // Logos and stamp images often come on a white background; on by default.
  const [clearWhite, setClearWhite] = useState(true);
  const dirty = JSON.stringify(design) !== saved;
  const checks = useMemo(() => designChecks(design, images), [design, images]);
  const blocked = checks.some((c) => c.level === "bad");

  // The language whose texts are being edited and previewed: always one the business picked.
  const textLang: Lang = design.langs.includes(pickedLang) ? pickedLang : design.langs[0];
  const set = (patch: Partial<Design>) => setDesign((d) => ({ ...d, ...patch }));

  /** Adds or removes a card language. At least one stays. Other languages are never shown anywhere. */
  function toggleLang(l: Lang) {
    setDesign((d) => {
      const on = d.langs.includes(l);
      if (on && d.langs.length === 1) return d;
      const langs = CARD_LANGS.filter((x) => (x === l ? !on : d.langs.includes(x)));
      return { ...d, langs };
    });
    if (!design.langs.includes(l)) setTextLang(l);
  }
  const setLook = (patch: Partial<CardLook>) => setDesign((d) => ({ ...d, look: { ...d.look, ...patch } }));

  /** Random gradient, direction and font. Logo, images, texts and stamps stay as they are. */
  function surprise() {
    const g = GRADIENTS[pick(Object.keys(GRADIENTS))];
    setDesign((d) => ({
      ...d,
      layout: d.layout === "photo" && d.hero ? "photo" : "gradient",
      colors: { bg: g.bg, fg: g.fg, stamp: g.stamp },
      look: { ...d.look, bg2: g.bg2, dir: pick(GRADIENT_DIRS), font: pick(Object.keys(FONTS) as FontId[]) },
    }));
  }
  const setText = (k: keyof Texts, v: string) =>
    setDesign((d) => ({ ...d, texts: { ...d.texts, [textLang]: { ...d.texts[textLang], [k]: v.slice(0, LIMITS[k]) } } }));

  async function upload(kind: "logo" | "hero" | "wallet" | "stamp", file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { notify(errorText(lang, "image_type"), true); return; }
    setBusy(kind);
    try {
      const photo = kind === "hero" || kind === "wallet";
      // Logos are PNG: Google Wallet needs PNG or JPEG for a business's class logo, and PNG keeps the transparent background.
      const format = kind === "logo" ? "image/png" : photo ? "image/jpeg" : "image/webp";
      let blob = await shrink(file, MAX_SIDE[kind], format, !photo && clearWhite);
      // A PNG is lossless, so a detailed logo can stay large even when small. Shrink again until it fits the upload cap.
      for (let side = Math.round(MAX_SIDE[kind] * 0.7); kind === "logo" && blob.size > UPLOAD_CAP && side >= 240; side = Math.round(side * 0.7)) {
        blob = await shrink(file, side, format, clearWhite);
      }
      if (blob.size > UPLOAD_CAP) { notify(errorText(lang, "image_too_big"), true); return; }
      const r = await fetch(`/api/asset?business=${encodeURIComponent(businessId)}&kind=${kind}`, {
        method: "POST", headers: { "Content-Type": blob.type }, body: blob, credentials: "same-origin",
      });
      const data: any = await r.json().catch(() => ({}));
      if (!r.ok) { notify(errorText(lang, data.code), true); return; }
      setImages((list) => [{ id: data.id, kind, width: data.width, height: data.height }, ...list]);
      if (kind === "logo") set({ logo: data.id });
      if (kind === "hero") set({ hero: data.id });
      if (kind === "wallet") set({ walletHero: data.id });
      if (kind === "stamp") set({ stamp: { icon: "image", image: data.id } });
    } catch {
      notify(t("err_network"), true);
    } finally {
      setBusy("");
    }
  }

  async function saveDraft(): Promise<boolean> {
    setBusy("save");
    const r = await post("/api/loyalty", { action: "save_design", business: businessId, design });
    setBusy("");
    if (!r.ok) { notify(errorText(lang, r.code), true); return false; }
    setSaved(JSON.stringify(design));
    return true;
  }

  async function publish() {
    if (!setup && !confirm(t("publishConfirm"))) return;
    if (dirty && !(await saveDraft())) return;
    setBusy("publish");
    const r = await post("/api/loyalty", { action: "publish_design", business: businessId });
    setBusy("");
    if (!r.ok) { notify(errorText(lang, r.code), true); return; }
    if (!setup) notify(t("publishedOk"));
    reload();
  }

  // The preview shows the card in the language being edited, with that language's direction
  // (Hebrew and Arabic right to left, English left to right) and its own labels.
  const pt: T = (key, vars) => translate(textLang, key, vars);
  const preview = { design, lang: textLang, stamps: demo, target, customerName: pt("sampleCustomer"), t: pt };
  const previewDir = isRtl(textLang) ? "rtl" : "ltr";
  const locale = lang === "he" ? "he-IL" : lang === "ar" ? "ar" : "en-GB";

  return (
    <div className="editor-grid">
      <div className="editor-preview">
        <div className="tabs" role="tablist">
          {(["web", "apple", "google"] as const).map((k) => (
            <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}>
              {k === "web" ? t("pvWeb") : k === "apple" ? "Apple Wallet" : "Google Wallet"}
            </button>
          ))}
        </div>
        {design.langs.length > 1 && (
          <div className="seg preview-langs" role="group" aria-label={t("edTexts")}>
            {design.langs.map((l) => <button key={l} type="button" aria-pressed={textLang === l} onClick={() => setTextLang(l)}>{t("langName_" + l)}</button>)}
          </div>
        )}
        <div className="preview-stage" dir={previewDir} lang={textLang}>
          {tab === "web" && <LoyaltyCard {...preview} />}
          {tab === "apple" && <ApplePreview {...preview} />}
          {tab === "google" && <GooglePreview {...preview} />}
        </div>
        <p className="form-hint center">{t(tab === "web" ? "pvNoteWeb" : tab === "apple" ? "pvNoteApple" : "pvNoteGoogle")}</p>
        {tab !== "web" && (
          <button type="button" className="btn soft small wallet-jump" onClick={() => document.getElementById("ed-wallet")?.scrollIntoView({ behavior: "smooth", block: "center" })}>
            <ImagePlus size={14} />{t("edWalletJump")}
          </button>
        )}
        <label className="demo-row">
          <span>{t("demoStamps")} <Num>{demo}/{target}</Num></span>
          <input type="range" min={0} max={target} value={demo} onChange={(e) => setDemo(Number(e.target.value))} />
        </label>

        <section className="panel publish-panel">
          <p className="muted">
            {editor.publishedVersion
              ? t("liveVersion", { v: editor.publishedVersion, d: new Date(editor.publishedAt!).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) })
              : t("noLiveVersion")}
          </p>
          {dirty ? <p className="dirty-note">{t("unsaved")}</p> : editor.hasUnpublished && <p className="dirty-note">{t("unpublishedDraft")}</p>}
          <div className="form-actions">
            <button className="btn soft" disabled={!!busy || !dirty} onClick={async () => { if (await saveDraft()) notify(t("draftSaved")); }}>{busy === "save" ? t("sending") : t("saveDraft")}</button>
            <button className="btn primary" disabled={!!busy || blocked} onClick={publish}>{busy === "publish" ? t("sending") : setup ? setup.publishLabel : t("publish")}</button>
          </div>
          {blocked && <p className="form-error">{t("err_design_checks")}</p>}
          <p className="form-hint">{t("designNoBalance")} {t("walletPublishNote")}</p>
        </section>

        <a className="design-help" target="_blank" rel="noopener noreferrer"
          href={`https://wa.me/${(PERKLY_SOCIAL.whatsapp ?? "").replace(/\D/g, "")}?text=${encodeURIComponent(t("designHelpText", { name: design.texts[textLang]?.title || design.texts[design.langs[0]].title }))}`}>
          <MessageCircle size={18} aria-hidden="true" />
          <span><b>{t("designHelpTitle")}</b><small>{t("designHelpSub")}</small></span>
        </a>
      </div>

      <div className="editor-controls">
        <section className="panel">
          <h2>{t("edLangs")}</h2>
          <p className="form-hint">{t("edLangsHint")}</p>
          <div className="seg langs-pick" role="group" aria-label={t("edLangs")}>
            {CARD_LANGS.filter((l) => OFFERED_CARD_LANGS.includes(l) || design.langs.includes(l)).map((l) => {
              const on = design.langs.includes(l);
              return (
                <button key={l} type="button" aria-pressed={on} disabled={on && design.langs.length === 1} onClick={() => toggleLang(l)}>
                  {t("langName_" + l)}
                </button>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>{t("edStampIcon")}</h2>
          <div className="icon-grid">
            {STAMP_ICONS.map((k) => {
              const Icon = ICONS[k];
              return (
                <button key={k} type="button" className="icon-choice" aria-pressed={design.stamp.icon === k} title={t("ic_" + k)} onClick={() => set({ stamp: { icon: k, image: null } })}>
                  <Icon size={22} /><span>{t("ic_" + k)}</span>
                </button>
              );
            })}
            <button type="button" className="icon-choice" aria-pressed={design.stamp.icon === "logo"} disabled={!design.logo} title={t("ic_logo")} onClick={() => set({ stamp: { icon: "logo", image: null } })}>
              {design.logo ? <img src={`/api/asset/${design.logo}`} alt="" /> : <ImagePlus size={22} />}<span>{t("ic_logo")}</span>
            </button>
            {paid ? (
              <label className="icon-choice" aria-pressed={design.stamp.icon === "image"}>
                <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { upload("stamp", e.target.files?.[0]); e.target.value = ""; }} />
                {design.stamp.icon === "image" && design.stamp.image ? <img src={`/api/asset/${design.stamp.image}`} alt="" /> : <UploadCloud size={22} />}
                <span>{busy === "stamp" ? t("uploading") : t("ic_image")}</span>
              </label>
            ) : (
              <button type="button" className="icon-choice locked" aria-pressed={design.stamp.icon === "image"} disabled={design.stamp.icon !== "image"}
                onClick={() => design.stamp.image && set({ stamp: { icon: "image", image: design.stamp.image } })}>
                {design.stamp.icon === "image" && design.stamp.image ? <img src={`/api/asset/${design.stamp.image}`} alt="" /> : <UploadCloud size={22} />}
                <span>{t("ic_image")}</span><PaidTag t={t} />
              </button>
            )}
          </div>
          <p className="form-hint">{paid ? t("productHint") : t("paidStampHint")}</p>
        </section>

        <section className="panel">
          <h2>{t("edLayout")}</h2>
          <div className="seg">
            {(["gradient", "solid", "photo"] as Layout[]).map((l) => (
              <button key={l} type="button" aria-pressed={design.layout === l} disabled={l === "photo" && !paid && !design.hero}
                onClick={() => set({ layout: l })}>{t("layout_" + l)}{l === "photo" && !paid && <PaidTag t={t} />}</button>
            ))}
          </div>
          <h3 className="sub-head">{t("edPalettes")}</h3>
          <div className="palettes">
            {Object.entries(PALETTES).map(([k, p]) => (
              <button key={k} type="button" className="palette" title={k} aria-label={k}
                aria-pressed={design.colors.bg === p.bg && design.colors.fg === p.fg && design.colors.stamp === p.stamp}
                style={{ background: p.bg }} onClick={() => set({ colors: { ...p }, look: { ...design.look, bg2: darken(p.bg) } })}>
                <i style={{ background: p.fg }} /><i style={{ background: p.stamp }} />
              </button>
            ))}
          </div>
          <div className="color-row">
            {([["bg", "edBg"], ["fg", "edFg"], ["stamp", "edStampColor"]] as const).map(([k, label]) => (
              <label key={k}>{t(label)}
                <span className="color-box">
                  <input type="color" value={design.colors[k].toLowerCase()} onChange={(e) => set({ colors: { ...design.colors, [k]: e.target.value.toUpperCase() } })} />
                  <code dir="ltr">{design.colors[k]}</code>
                </span>
              </label>
            ))}
          </div>

          {design.layout === "gradient" && (
            <>
              <h3 className="sub-head">{t("edGradients")}</h3>
              <div className="palettes">
                {Object.entries(GRADIENTS).map(([k, g]) => (
                  <button key={k} type="button" className="palette" title={k} aria-label={k}
                    aria-pressed={design.colors.bg === g.bg && design.look.bg2 === g.bg2}
                    style={{ background: `linear-gradient(150deg, ${g.bg}, ${g.bg2})` }}
                    onClick={() => set({ colors: { bg: g.bg, fg: g.fg, stamp: g.stamp }, look: { ...design.look, bg2: g.bg2 } })}>
                    <i style={{ background: g.fg }} /><i style={{ background: g.stamp }} />
                  </button>
                ))}
              </div>
              <div className="color-row">
                <label>{t("edBg2")}
                  <span className="color-box">
                    <input type="color" value={design.look.bg2.toLowerCase()} onChange={(e) => setLook({ bg2: e.target.value.toUpperCase() })} />
                    <code dir="ltr">{design.look.bg2}</code>
                  </span>
                </label>
              </div>
              <h3 className="sub-head">{t("edGradDir")}</h3>
              <div className="seg">
                {GRADIENT_DIRS.map((d) => (
                  <button key={d} type="button" aria-pressed={design.look.dir === d} onClick={() => setLook({ dir: d })}>{t("dir_" + d)}</button>
                ))}
              </div>
            </>
          )}

          {design.layout === "photo" && (
            <label className="demo-row">
              <span>{t("edOverlay")} <Num>{design.look.overlay}%</Num></span>
              <input type="range" min={0} max={90} step={5} value={design.look.overlay} onChange={(e) => setLook({ overlay: Number(e.target.value) })} />
            </label>
          )}
        </section>

        <section className="panel">
          <link rel="stylesheet" href={ALL_FONTS_HREF} />
          <div className="section-head" style={{ marginBottom: 12 }}>
            <h2>{t("edType")}</h2>
            <button type="button" className="btn soft small" onClick={surprise}><Shuffle size={14} />{t("edSurprise")}</button>
          </div>
          <div className="icon-grid font-grid">
            {(Object.keys(FONTS) as FontId[]).map((k) => (
              <button key={k} type="button" className="icon-choice font-choice" aria-pressed={design.look.font === k}
                style={{ fontFamily: FONTS[k].family }} onClick={() => setLook({ font: k })}>
                <b>{FONT_SCRIPTS[k].ar && !FONT_SCRIPTS[k].he ? "أبج Abc" : "אבג Abc"}</b><span>{FONTS[k].label}</span>
                <small className="font-scripts" dir="ltr">{[FONT_SCRIPTS[k].he && "עב", FONT_SCRIPTS[k].ar && "ع", "En"].filter(Boolean).join(" · ")}</small>
              </button>
            ))}
          </div>
          <p className="form-hint">{t("edFontHint")}</p>
          <h3 className="sub-head">{t("edTextSize")}</h3>
          <div className="seg">
            {SIZES.map((z) => <button key={z} type="button" aria-pressed={design.look.text === z} onClick={() => setLook({ text: z })}>{t("size_" + z)}</button>)}
          </div>
          <h3 className="sub-head">{t("edStampSize")}</h3>
          <div className="seg">
            {SIZES.map((z) => <button key={z} type="button" aria-pressed={design.look.stamps === z} onClick={() => setLook({ stamps: z })}>{t("size_" + z)}</button>)}
          </div>
        </section>

        <section className="panel">
          <div className="section-head" style={{ marginBottom: 8 }}>
            <h2>{t("edImages")}</h2>
            {!paid && <PaidTag t={t} />}
          </div>
          {!paid && (
            <p className="paid-note">
              {t("paidImagesNote")} {upgradeHref && <a href={upgradeHref}>{t("activateSub")}</a>}
            </p>
          )}
          <div className="uploads">
            {([["logo", "edLogo", "edLogoHint"], ["hero", "edHero", "edHeroHint"], ["wallet", "edWallet", "edWalletHint"]] as const).map(([kind, label, hint]) => {
              const id = kind === "logo" ? design.logo : kind === "hero" ? design.hero : design.walletHero;
              const meta = images.find((i) => i.id === id);
              return (
                <div className="upload" key={kind} id={"ed-" + kind}>
                  <span className="thumb">{id ? <img src={`/api/asset/${id}`} alt="" /> : <ImagePlus size={22} />}</span>
                  <div>
                    <b>{t(label)}</b>
                    <small className="form-hint">{t(hint)}</small>
                    {meta && <small className="form-hint" dir="ltr">{meta.width}×{meta.height}{(kind === "logo" ? Math.min(meta.width, meta.height) : meta.width) < IMAGE_MIN[kind] ? " ⚠" : ""}</small>}
                    <div className="row-actions">
                      {paid ? (
                        <label className="btn soft small">
                          <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { upload(kind, e.target.files?.[0]); e.target.value = ""; }} />
                          <UploadCloud size={14} />{busy === kind ? t("uploading") : t("upload")}
                        </label>
                      ) : (
                        <button type="button" className="btn soft small" disabled><Lock size={14} />{t("upload")}</button>
                      )}
                      {id && (
                        <button type="button" className="btn soft small" onClick={() => kind === "logo"
                          ? set({ logo: null, stamp: design.stamp.icon === "logo" ? { icon: "star", image: null } : design.stamp })
                          : kind === "hero" ? set({ hero: null }) : set({ walletHero: null })}>
                          <Trash2 size={14} />{t("remove")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {design.logo && (
            <div className="logo-controls">
              <h3 className="sub-head">{t("edLogoLook")}</h3>
              <label className="demo-row">
                <span>{t("edLogoSize")} <Num>{design.look.logoSize}%</Num></span>
                <input type="range" min={60} max={200} step={10} value={design.look.logoSize} onChange={(e) => setLook({ logoSize: Number(e.target.value) })} />
              </label>
              <div className="seg">
                {(["none", "circle", "square"] as LogoFrame[]).map((f) => (
                  <button key={f} type="button" aria-pressed={design.look.logoFrame === f} onClick={() => setLook({ logoFrame: f })}>{t("logoFrame_" + f)}</button>
                ))}
              </div>
              <label className="check-row clear-white">
                <input type="checkbox" checked={design.look.logoName} onChange={(e) => setLook({ logoName: e.target.checked })} />
                <span>{t("edLogoName")}</span>
              </label>
            </div>
          )}
          {paid && (
            <label className="check-row clear-white">
              <input type="checkbox" checked={clearWhite} onChange={(e) => setClearWhite(e.target.checked)} />
              <span>{t("edClearWhite")}<small className="form-hint">{t("edClearWhiteHint")}</small></span>
            </label>
          )}
        </section>

        <section className="panel">
          <h2>{t("edTexts")}</h2>
          <div className="seg">
            {design.langs.map((l) => <button key={l} type="button" aria-pressed={textLang === l} onClick={() => setTextLang(l)}>{t("langName_" + l)}</button>)}
          </div>
          <p className="form-hint">{t("edTextsHint")}</p>
          <div className="stack-form" dir={isRtl(textLang) ? "rtl" : "ltr"}>
            {(["title", "subtitle", "reward", "gift"] as (keyof Texts)[]).map((k) => (
              <label key={k}>
                <span className="label-row">{t("f" + k[0].toUpperCase() + k.slice(1))}<small><Num>{design.texts[textLang][k].length}/{LIMITS[k]}</Num></small></span>
                <input value={design.texts[textLang][k]} maxLength={LIMITS[k]} onChange={(e) => setText(k, e.target.value)} />
              </label>
            ))}
          </div>
          <label className="check" style={{ marginTop: 14 }}>
            <input type="checkbox" checked={design.showCustomerName} onChange={(e) => set({ showCustomerName: e.target.checked })} />
            <span>{t("edShowName")}</span>
          </label>
        </section>

        <section className="panel">
          <h2>{t("edChecks")}</h2>
          <ul className="checks">
            {checks.map((c, i) => (
              <li key={i}>
                <span className={"lv " + c.level}>{t("lv_" + c.level)}</span>
                <span>{t(c.key, { ...c.vars, ...(c.vars?.l ? { lname: t("langName_" + c.vars.l) } : {}) })}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export type { StampIcon };
