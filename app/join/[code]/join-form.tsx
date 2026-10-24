"use client";
import { useState } from "react";
import { errorText, useLang } from "../../../lib/i18n";
import { post } from "../../../lib/api";
import { LangSwitch } from "../../../components/lang-switch";
import { LoyaltyCard } from "../../../components/loyalty-card";
import { BirthdayFields } from "../../../components/birthday-fields";
import { birthdayFromParts } from "../../../lib/birthday";

import type { Design } from "../../../lib/design";
import { textsFor } from "../../../lib/design";

type Business = { name: string; target: number; design: Design; birthdays: boolean };

export default function JoinForm({ code, business }: { code: string; business: Business | null }) {
  const { lang, setLang, t, dir } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const result = await post("/api/join", {
      code,
      name: form.get("name"),
      phone: form.get("phone"),
      terms: form.get("terms") === "on",
      marketing: form.get("marketing") === "on",
      birthday: business?.birthdays ? birthdayFromParts(form.get("bday"), form.get("bmonth")) : "",
    });
    if (result.ok) {
      window.location.replace(result.data.cardPath);
      return;
    }
    setError(errorText(lang, result.code));
    setBusy(false);
  }

  return (
    <div className="auth-page" dir={dir}>
      <div className="auth-top">
        <span className="brand">perkly<span>.</span></span>
        <LangSwitch lang={lang} setLang={setLang} />
      </div>
      {!business ? (
        <div className="auth-card panel"><h1>{t("err_join_invalid")}</h1></div>
      ) : (
        <form className="auth-card panel" onSubmit={submit}>
          <h1>{t("joinTitle", { b: textsFor(business.design, lang).title || business.name })}</h1>
          <p className="muted">{t("joinIntro")}</p>
          <LoyaltyCard design={business.design} lang={lang} stamps={0} target={business.target} t={t} />
          <label>{t("name")}<input name="name" required maxLength={80} autoComplete="name" /></label>
          <label>{t("phone")}<input name="phone" type="tel" required maxLength={20} autoComplete="tel" dir="ltr" placeholder={t("phoneHint")} /></label>
          {business.birthdays && <BirthdayFields t={t} />}
          <label className="check"><input type="checkbox" name="terms" required /> <span>{t("terms")}</span></label>
          <p className="form-hint legal-links"><a href="/terms" target="_blank" rel="noreferrer">{t("termsLink")}</a> · <a href="/privacy" target="_blank" rel="noreferrer">{t("privacyLink")}</a></p>
          <label className="check"><input type="checkbox" name="marketing" /> <span>{t("marketing")}</span></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="btn primary wide" disabled={busy}>{busy ? t("loading") : t("getCard")}</button>
          <p className="form-hint">{t("phoneNotVerified")}</p>
        </form>
      )}
    </div>
  );
}
