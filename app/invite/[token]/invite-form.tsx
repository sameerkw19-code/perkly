"use client";
import { useState } from "react";
import { Users } from "lucide-react";
import { errorText, useLang } from "../../../lib/i18n";
import { post } from "../../../lib/api";
import { LangSwitch } from "../../../components/lang-switch";
import { Brand } from "../../../components/brand";

export default function InviteForm({ token, business, signedInEmail }: { token: string; business: string | null; signedInEmail: string | null }) {
  const { lang, setLang, t, dir } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const result = await post("/api/auth", {
      action: "accept_invite",
      token,
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    });
    if (result.ok) {
      window.location.href = "/?business=" + encodeURIComponent(result.data.business);
      return;
    }
    setError(errorText(lang, result.code));
    setBusy(false);
  }

  return (
    <div className="auth-page" dir={dir}>
      <div className="auth-top">
        <Brand href="/" />
        <LangSwitch lang={lang} setLang={setLang} />
      </div>
      <form className="auth-card panel" onSubmit={submit}>
        <span className="modal-icon"><Users /></span>
        {!business ? (
          <>
            <h1>{t("err_invite_invalid")}</h1>
            <a className="btn soft wide" href="/login">{t("signIn")}</a>
          </>
        ) : (
          <>
            <h1>{t("inviteTitle", { b: business })}</h1>
            {signedInEmail ? (
              <p>{t("inviteSignedIn", { email: signedInEmail })}</p>
            ) : (
              <>
                <p className="muted">{t("inviteIntro")}</p>
                <label>{t("yourName")}<input name="name" required maxLength={80} autoComplete="name" /></label>
                <label>{t("email")}<input name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" /></label>
                <label>{t("password")}<input name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" dir="ltr" /><small className="form-hint">{t("passwordHint")}</small></label>
              </>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn primary wide" disabled={busy}>{busy ? t("loading") : t("acceptInvite")}</button>
            {!signedInEmail && <a className="text-btn" href="/login">{t("haveAccount")}</a>}
          </>
        )}
      </form>
    </div>
  );
}
