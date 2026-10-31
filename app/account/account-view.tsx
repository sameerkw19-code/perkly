"use client";
import { useState } from "react";
import { ArrowRight, LogOut, Trash2, UserRound } from "lucide-react";
import { errorText, useLang } from "../../lib/i18n";
import { post } from "../../lib/api";
import { LangSwitch } from "../../components/lang-switch";
import { Brand } from "../../components/brand";

export default function AccountView({ name, email }: { name: string; email: string }) {
  const { lang, setLang, t, dir } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function signOutEverywhere() {
    if (!window.confirm(t("signOutAllConfirm"))) return;
    setBusy(true);
    await post("/api/auth", { action: "logout_all" });
    window.location.href = "/login";
  }

  async function deleteAccount(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    if (!window.confirm(t("deleteAccountConfirm"))) return;
    setBusy(true);
    setError("");
    const r = await post("/api/auth", { action: "delete_account", password: form.get("password") });
    if (r.ok) {
      window.location.href = "/";
      return;
    }
    setError(errorText(lang, r.code));
    setBusy(false);
  }

  return (
    <div className="auth-page" dir={dir}>
      <header className="auth-top">
        <Brand href="/" />
        <LangSwitch lang={lang} setLang={setLang} />
      </header>
      <main id="main" className="auth-card panel account-card">
        <span className="modal-icon"><UserRound /></span>
        <h1>{t("accountTitle")}</h1>
        <p><strong>{name}</strong><br /><span dir="ltr">{email}</span></p>

        <section aria-labelledby="sec-devices">
          <h2 id="sec-devices">{t("accountDevices")}</h2>
          <p className="form-hint">{t("accountDevicesHint")}</p>
          <button type="button" className="btn soft wide" disabled={busy} onClick={signOutEverywhere}><LogOut size={16} />{t("signOutAll")}</button>
        </section>

        <section aria-labelledby="sec-delete">
          <h2 id="sec-delete">{t("deleteAccount")}</h2>
          <p className="form-hint">{t("deleteAccountHint")}</p>
          <form onSubmit={deleteAccount}>
            <label>{t("password")}<input name="password" type="password" required maxLength={200} autoComplete="current-password" dir="ltr" /></label>
            {error && <p className="form-error" role="alert">{error}</p>}
            <button className="btn soft wide danger" disabled={busy}><Trash2 size={16} />{t("deleteAccount")}</button>
          </form>
        </section>

        <a className="text-btn" href="/"><ArrowRight size={15} />{t("spBack")}</a>
      </main>
    </div>
  );
}
