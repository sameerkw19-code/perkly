"use client";
import { useState } from "react";
import { KeyRound, LogIn, MailCheck, UserPlus } from "lucide-react";
import { errorText, useLang } from "../../lib/i18n";
import { post } from "../../lib/api";
import { LangSwitch } from "../../components/lang-switch";
import { Brand } from "../../components/brand";

export default function AuthForm({ needsCode, mailReady = false, next = "/", initialMode = "login" }: { needsCode: boolean; mailReady?: boolean; next?: string; initialMode?: "login" | "signup" }) {
  const { lang, setLang, t, dir } = useLang();
  const [mode, setMode] = useState<"login" | "signup" | "forgot">(initialMode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  // Set when the password was right and a code was emailed (second sign-in step).
  const [step, setStep] = useState<{ challenge: string; sentTo: string } | null>(null);

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
    if (result.ok && result.data?.code) {
      setStep({ challenge: result.data.challenge, sentTo: result.data.sentTo });
      setBusy(false);
      return;
    }
    if (result.ok) {
      window.location.href = next;
      return;
    }
    setError(errorText(lang, result.code));
    setBusy(false);
  }

  async function submitCode(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !step) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const result = await post("/api/auth", { action: "verify_code", challenge: step.challenge, code: form.get("code"), remember: form.get("remember") === "on" });
    if (result.ok) {
      window.location.href = next;
      return;
    }
    setError(errorText(lang, result.code));
    setBusy(false);
  }

  async function resend() {
    if (busy || !step) return;
    setBusy(true);
    setError("");
    setInfo("");
    const result = await post("/api/auth", { action: "resend_code", challenge: step.challenge });
    if (result.ok) setInfo(t("codeResent"));
    else setError(errorText(lang, result.code));
    setBusy(false);
  }

  async function submitForgot(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const result = await post("/api/auth", { action: "forgot_password", email: form.get("email") });
    if (result.ok) setInfo(t("forgotSent"));
    else setError(errorText(lang, result.code));
    setBusy(false);
  }

  if (step) {
    return (
      <div className="auth-page" dir={dir}>
        <div className="auth-top">
          <Brand href="/" />
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
        <form key="code-step" className="auth-card panel" onSubmit={submitCode}>
          <span className="modal-icon"><MailCheck /></span>
          <h1>{t("codeTitle")}</h1>
          <p className="form-hint">{t("codeHint", { email: "\u2066" + step.sentTo + "\u2069" })}</p>
          <label>{t("codeLabel")}
            <input key="code" defaultValue="" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required dir="ltr" autoFocus className="code-input" />
          </label>
          <label className="check"><input type="checkbox" name="remember" defaultChecked /><span>{t("codeRemember")}</span></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {info && <p className="form-hint" role="status">{info}</p>}
          <button className="btn primary wide" disabled={busy}>{busy ? t("loading") : t("codeSubmit")}</button>
          <button type="button" className="text-btn" onClick={resend} disabled={busy}>{t("codeResend")}</button>
          <button type="button" className="text-btn" onClick={() => { setStep(null); setError(""); setInfo(""); }}>{t("codeBack")}</button>
        </form>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className="auth-page" dir={dir}>
        <div className="auth-top">
          <Brand href="/" />
          <LangSwitch lang={lang} setLang={setLang} />
        </div>
        <form key="forgot-step" className="auth-card panel" onSubmit={submitForgot}>
          <span className="modal-icon"><KeyRound /></span>
          <h1>{t("forgotTitle")}</h1>
          <p className="form-hint">{t("forgotHint")}</p>
          <label>{t("email")}<input name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" autoFocus /></label>
          {error && <p className="form-error" role="alert">{error}</p>}
          {info && <p className="form-hint" role="status">{info}</p>}
          <button className="btn primary wide" disabled={busy || !!info}>{busy ? t("loading") : t("forgotSubmit")}</button>
          <button type="button" className="text-btn" onClick={() => { setMode("login"); setError(""); setInfo(""); }}>{t("codeBack")}</button>
        </form>
      </div>
    );
  }

  return (
    <div className="auth-page" dir={dir}>
      <div className="auth-top">
        <Brand href="/" />
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
        {mode === "login" ? (
          <a className="text-btn" href="/start">{t("noAccount")}</a>
        ) : (
          <button type="button" className="text-btn" onClick={() => { setMode("login"); setError(""); }}>{t("haveAccount")}</button>
        )}
        <p className="form-hint">{t("staffNoAccount")}</p>
        {mode === "login" && (mailReady
          ? <button type="button" className="text-btn" onClick={() => { setMode("forgot"); setError(""); }}>{t("forgotLink")}</button>
          : <p className="form-hint">{t("noPasswordReset")}</p>)}
      </form>
    </div>
  );
}
