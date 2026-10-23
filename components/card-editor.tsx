"use client";
import { useMemo, useState } from "react";
import { ImagePlus, Trash2, UploadCloud } from "lucide-react";
import {
  IMAGE_MIN, LIMITS, PALETTES, STAMP_ICONS, designChecks, type AssetMeta, type Design, type Layout, type StampIcon, type Texts,
} from "../lib/design";
import type { Lang } from "../lib/i18n-types";
import { LANGS, errorText } from "../lib/i18n";
import { post } from "../lib/api";
import { ApplePreview, GooglePreview, ICONS, LoyaltyCard, Num } from "./loyalty-card";

type Image = AssetMeta & { kind: string };
type Editor = { draft: Design; publishedVersion: number; publishedAt: string | null; hasUnpublished: boolean; images: Image[] };
type T = (key: string, vars?: Record<string, string | number>) => string;

const MAX_SIDE = { logo: 800, hero: 1200, stamp: 400 } as const;

/** Shrinks an image in the browser before upload (keeps transparency). */
async function shrink(file: File, maxSide: number): Promise<Blob> {
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
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/webp", 0.86));
    // Some browsers can't write WebP and silently return PNG; both are accepted.
    return blob ?? (await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j()), "image/png")));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function CardEditor({ businessId, target, editor, t, lang, notify, reload }: {
  businessId: string; target: number; editor: Editor; t: T; lang: Lang;
  notify: (s: string, bad?: boolean) => void; reload: () => void;
}) {
  const [design, setDesign] = useState<Design>(editor.draft);
  const [saved, setSaved] = useState(JSON.stringify(editor.draft));
  const [images, setImages] = useState<Image[]>(editor.images);
  const [textLang, setTextLang] = useState<Lang>(lang);
  const [tab, setTab] = useState<"web" | "apple" | "google">("web");
  const [demo, setDemo] = useState(Math.min(3, target));
  const [busy, setBusy] = useState("");
  const dirty = JSON.stringify(design) !== saved;
  const checks = useMemo(() => designChecks(design, images), [design, images]);
  const blocked = checks.some((c) => c.level === "bad");

  const set = (patch: Partial<Design>) => setDesign((d) => ({ ...d, ...patch }));
  const setText = (k: keyof Texts, v: string) =>
    setDesign((d) => ({ ...d, texts: { ...d.texts, [textLang]: { ...d.texts[textLang], [k]: v.slice(0, LIMITS[k]) } } }));

  async function upload(kind: "logo" | "hero" | "stamp", file: File | undefined) {
    if (!file) return;
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) { notify(errorText(lang, "image_type"), true); return; }
    setBusy(kind);
    try {
      const blob = await shrink(file, MAX_SIDE[kind]);
      const r = await fetch(`/api/asset?business=${encodeURIComponent(businessId)}&kind=${kind}`, {
        method: "POST", headers: { "Content-Type": blob.type }, body: blob, credentials: "same-origin",
      });
      const data: any = await r.json().catch(() => ({}));
      if (!r.ok) { notify(errorText(lang, data.code), true); return; }
      setImages((list) => [{ id: data.id, kind, width: data.width, height: data.height }, ...list]);
      if (kind === "logo") set({ logo: data.id });
      if (kind === "hero") set({ hero: data.id });
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
    if (!confirm(t("publishConfirm"))) return;
    if (dirty && !(await saveDraft())) return;
    setBusy("publish");
    const r = await post("/api/loyalty", { action: "publish_design", business: businessId });
    setBusy("");
    if (!r.ok) { notify(errorText(lang, r.code), true); return; }
    notify(t("publishedOk"));
    reload();
  }

  const preview = { design, lang, stamps: demo, target, customerName: t("sampleCustomer"), t };
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
        <div className="preview-stage">
          {tab === "web" && <LoyaltyCard {...preview} />}
          {tab === "apple" && <ApplePreview {...preview} />}
          {tab === "google" && <GooglePreview {...preview} />}
        </div>
        <p className="form-hint center">{t(tab === "web" ? "pvNoteWeb" : tab === "apple" ? "pvNoteApple" : "pvNoteGoogle")}</p>
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
            <button className="btn primary" disabled={!!busy || blocked} onClick={publish}>{busy === "publish" ? t("sending") : t("publish")}</button>
          </div>
          {blocked && <p className="form-error">{t("err_design_checks")}</p>}
          <p className="form-hint">{t("designNoBalance")} {t("walletPublishNote")}</p>
        </section>
      </div>

      <div className="editor-controls">
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
            <label className="icon-choice" aria-pressed={design.stamp.icon === "image"}>
              <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { upload("stamp", e.target.files?.[0]); e.target.value = ""; }} />
              {design.stamp.icon === "image" && design.stamp.image ? <img src={`/api/asset/${design.stamp.image}`} alt="" /> : <UploadCloud size={22} />}
              <span>{busy === "stamp" ? t("uploading") : t("ic_image")}</span>
            </label>
          </div>
          <p className="form-hint">{t("productHint")}</p>
        </section>

        <section className="panel">
          <h2>{t("edLayout")}</h2>
          <div className="seg">
            {(["gradient", "solid", "photo"] as Layout[]).map((l) => (
              <button key={l} type="button" aria-pressed={design.layout === l} onClick={() => set({ layout: l })}>{t("layout_" + l)}</button>
            ))}
          </div>
          <h3 className="sub-head">{t("edPalettes")}</h3>
          <div className="palettes">
            {Object.entries(PALETTES).map(([k, p]) => (
              <button key={k} type="button" className="palette" title={k} aria-label={k}
                aria-pressed={design.colors.bg === p.bg && design.colors.fg === p.fg && design.colors.stamp === p.stamp}
                style={{ background: p.bg }} onClick={() => set({ colors: { ...p } })}>
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
        </section>

        <section className="panel">
          <h2>{t("edImages")}</h2>
          <div className="uploads">
            {([["logo", "edLogo", "edLogoHint"], ["hero", "edHero", "edHeroHint"]] as const).map(([kind, label, hint]) => {
              const id = kind === "logo" ? design.logo : design.hero;
              const meta = images.find((i) => i.id === id);
              return (
                <div className="upload" key={kind}>
                  <span className="thumb">{id ? <img src={`/api/asset/${id}`} alt="" /> : <ImagePlus size={22} />}</span>
                  <div>
                    <b>{t(label)}</b>
                    <small className="form-hint">{t(hint)}</small>
                    {meta && <small className="form-hint" dir="ltr">{meta.width}×{meta.height}{Math.min(meta.width, meta.height) < IMAGE_MIN[kind] ? " ⚠" : ""}</small>}
                    <div className="row-actions">
                      <label className="btn soft small">
                        <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => { upload(kind, e.target.files?.[0]); e.target.value = ""; }} />
                        <UploadCloud size={14} />{busy === kind ? t("uploading") : t("upload")}
                      </label>
                      {id && (
                        <button type="button" className="btn soft small" onClick={() => kind === "logo"
                          ? set({ logo: null, stamp: design.stamp.icon === "logo" ? { icon: "star", image: null } : design.stamp })
                          : set({ hero: null })}>
                          <Trash2 size={14} />{t("remove")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="panel">
          <h2>{t("edTexts")}</h2>
          <div className="seg">
            {LANGS.map((l) => <button key={l} type="button" aria-pressed={textLang === l} onClick={() => setTextLang(l)}>{t("langName_" + l)}</button>)}
          </div>
          <p className="form-hint">{t("edTextsHint")}</p>
          <div className="stack-form" dir={textLang === "en" ? "ltr" : "rtl"}>
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
