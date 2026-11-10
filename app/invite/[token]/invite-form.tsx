"use client";
import { useState } from "react";
import { KeyRound, Users } from "lucide-react";
import { errorText, useLang } from "../../../lib/i18n";
import { post } from "../../../lib/api";
import { LangSwitch } from "../../../components/lang-switch";
import { InstallApp, rememberWorkerPhone } from "../../../components/install-app";
import { Brand } from "../../../components/brand";

export default function InviteForm({ token, business, inviteEmail, owner = false, signedInEmail }: { token: string; business: string | null; inviteEmail: string | null; owner?: boolean; signedInEmail: string | null }) {
  const { lang, setLang, t, dir } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // After joining as staff: how to sign in at the counter from now on, and the home-screen shortcut.
  const [joined, setJoined] = useState<{ business: string; phone: string } | null>(null);

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
      phone: form.get("phone") || undefined,
      birthDate: form.get("birthDate") || undefined,
    });
    if (result.ok) {
      if (result.data.workerPhone) {
        rememberWorkerPhone(String(form.get("phone")));
        setJoined({ business: result.data.business, phone: result.data.workerPhone });
        setBusy(false);
        return;
      }
      window.location.href = "/?business=" + encodeURIComponent(result.data.business);
      return;
    }
    setError(errorText(lang, result.code));
    setBusy(false);
  }

  return (
    <div className="auth-page" dir={dir}>
      <header className="auth-top">
        <Brand href="/" />
        <LangSwitch lang={lang} setLang={setLang} />
      </header>
      <main id="main" className="page-main">
      {joined ? (
        <div className="auth-card panel worker-code-card" role="status">
          <span className="modal-icon"><KeyRound /></span>
          <h1>{t("workerJoinedTitle")}</h1>
          <p className="muted">{t("workerJoinedHint", { phone: "\u2066" + joined.phone + "\u2069" })}</p>
          <a className="btn primary wide" href={"/?business=" + encodeURIComponent(joined.business)}>{t("workerCodeGo")}</a>
          <InstallApp t={t} />
        </div>
      ) : (
      <form className="auth-card panel" onSubmit={submit}>
        <span className="modal-icon"><Users /></span>
        {!business ? (
          <>
            <h1>{t("err_invite_invalid")}</h1>
            <a className="btn soft wide" href="/login">{t("signIn")}</a>
          </>
        ) : (
          <>
            <h1>{t(owner ? "ownerInviteTitle" : "inviteTitle", { b: business })}</h1>
            {inviteEmail && <p className="form-hint">{t("inviteForEmail", { email: "\u2066" + inviteEmail + "\u2069" })}</p>}
            {signedInEmail && inviteEmail && signedInEmail !== inviteEmail ? (
              <p className="form-error" role="alert">{t("err_invite_other_email")}</p>
            ) : signedInEmail ? (
              <p>{t("inviteSignedIn", { email: signedInEmail })}</p>
            ) : (
              <>
                <p className="muted">{t(owner ? "ownerInviteIntro" : "inviteIntro")}</p>
                <label>{t("yourName")}<input name="name" required maxLength={80} autoComplete="name" /></label>
                {!owner && (
                  <>
                    <label>{t("phone")}<input name="phone" type="tel" required maxLength={20} autoComplete="tel" dir="ltr" /></label>
                    <label>{t("birthDate")}<input name="birthDate" required inputMode="numeric" maxLength={10} placeholder={t("birthDatePh")} dir="ltr" autoComplete="bday" /><small className="form-hint">{t("birthDateHint")}</small></label>
                  </>
                )}
                <label>{t("email")}<input name="email" type="email" required maxLength={200} autoComplete="email" dir="ltr" defaultValue={inviteEmail ?? ""} readOnly={!!inviteEmail} /></label>
                <label>{t("password")}<input name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" dir="ltr" /><small className="form-hint">{t("passwordHint")}</small></label>
              </>
            )}
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn primary wide" disabled={busy}>{busy ? t("loading") : t(owner ? "ownerInviteAccept" : "acceptInvite")}</button>
            {!signedInEmail && <a className="text-btn" href="/login">{t("haveAccount")}</a>}
          </>
        )}
      </form>
      )}
      </main>
    </div>
  );
}
