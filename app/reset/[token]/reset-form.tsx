"use client";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { errorText, useLang } from "../../../lib/i18n";
import { post } from "../../../lib/api";
import { LangSwitch } from "../../../components/lang-switch";

/** Sets a new password from a one-time link, then signs in. */
export default function ResetForm({ token }: { token: string }) {
  const { lang, setLang, t, dir } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const r = await post("/api/auth", { action: "reset_password", token, password: new FormData(e.currentTarget).get("password") });
    if (r.ok) { window.location.replace("/"); return; }
    setError(errorText(lang, r.code));
    setBusy(false);
  }

  return (
    <div className="auth-page" dir={dir}>
      <div className="auth-top">
        <a className="brand" href="/">perkly<span>.</span></a>
        <LangSwitch lang={lang} setLang={setLang} />
      </div>
      <form className="auth-card panel" onSubmit={submit}>
        <span className="modal-icon"><KeyRound /></span>
        <h1>{t("resetTitle")}</h1>
        <label>{t("resetNew")}
          <input name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" dir="ltr" />
          <small className="form-hint">{t("passwordHint")}</small>
        </label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? t("loading") : t("resetSave")}</button>
      </form>
    </div>
  );
}
