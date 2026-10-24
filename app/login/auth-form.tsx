"use client";
import { useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { errorText, useLang } from "../../lib/i18n";
import { post } from "../../lib/api";
import { LangSwitch } from "../../components/lang-switch";

export default function AuthForm({ needsCode, next = "/", initialMode = "login" }: { needsCode: boolean; next?: string; initialMode?: "login" | "signup" }) {
  const { lang, setLang, t, dir } = useLang();
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const result = await post("/api/auth", {
      action: mode,
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
      signupCode: form.get("signupCode") || undefined,
    });
    if (result.ok) {
      window.location.href = next;
      return;
    }
    setError(errorText(lang, result.code));
    setBusy(false);
  }

  return (
    <div className="auth-page" dir={dir}>
      <div className="auth-top">
        <a className="brand" href="/">perkly<span>.</span></a>
        <LangSwitch lang={lang} setLang={setLang} />
      </div>
      <form className="auth-card panel" onSubmit={submit}>
        <span className="modal-icon">{mode === "login" ? <LogIn /> : <UserPlus />}</span>
        <h1>{mode === "login" ? t("signIn") : t("signUp")}</h1>
        {mode === "signup" && (
          <label>{t("yourName")}<input name="name" required maxLength={80} autoComplete="name" /></label>
        )}
        <label>{t("email")}<input name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" /></label>
        <label>
          {t("password")}
          <input name="password" type="password" required minLength={8} maxLength={200} autoComplete={mode === "login" ? "current-password" : "new-password"} dir="ltr" />
          {mode === "signup" && <small className="form-hint">{t("passwordHint")}</small>}
        </label>
        {mode === "signup" && needsCode && (
          <label>{t("signupCode")}<input name="signupCode" required maxLength={100} dir="ltr" /><small className="form-hint">{t("signupCodeHint")}</small></label>
        )}
        {mode === "signup" && (
          <p className="form-hint legal-links">{t("legalAgreeSignup")} <a href="/terms" target="_blank" rel="noreferrer">{t("termsLink")}</a> · <a href="/privacy" target="_blank" rel="noreferrer">{t("privacyLink")}</a></p>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary wide" disabled={busy}>{busy ? t("loading") : mode === "login" ? t("signIn") : t("signUp")}</button>
        <button type="button" className="text-btn" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>
          {mode === "login" ? t("noAccount") : t("haveAccount")}
        </button>
        <p className="form-hint">{t("staffNoAccount")}</p>
        {mode === "login" && <p className="form-hint">{t("noPasswordReset")}</p>}
      </form>
    </div>
  );
}
