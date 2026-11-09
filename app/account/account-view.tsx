"use client";
import { useState } from "react";
import { ArrowRight, KeyRound, LogOut, Trash2, UserRound } from "lucide-react";
import { errorText, useLang } from "../../lib/i18n";
import { post } from "../../lib/api";
import { LangSwitch } from "../../components/lang-switch";
import { Brand } from "../../components/brand";
import { rememberWorkerPhone } from "../../components/install-app";

export default function AccountView({ name, email, staffIn = [] }: { name: string; email: string; staffIn?: { id: string; name: string }[] }) {
  const { lang, setLang, t, dir } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workerSaved, setWorkerSaved] = useState("");

  async function saveWorkerLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const r = await post("/api/auth", { action: "set_worker_login", phone: form.get("phone"), birthDate: form.get("birthDate"), password: form.get("password") });
    if (r.ok) { setWorkerSaved(r.data.workerPhone); rememberWorkerPhone(String(form.get("phone"))); e.currentTarget.reset(); }
    else setError(errorText(lang, r.code));
    setBusy(false);
  }

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

        {staffIn.length > 0 && (
          <section aria-labelledby="sec-worker">
            <h2 id="sec-worker">{t("workerLoginTitle")}</h2>
            <p className="form-hint">{t("workerLoginAccountHint")}</p>
            <form className="stack-form" onSubmit={saveWorkerLogin}>
              <label>{t("phone")}<input name="phone" type="tel" required maxLength={20} autoComplete="tel" dir="ltr" /></label>
              <label>{t("birthDate")}<input name="birthDate" required inputMode="numeric" maxLength={10} placeholder={t("birthDatePh")} dir="ltr" autoComplete="bday" /></label>
              <label>{t("password")}<input name="password" type="password" required maxLength={200} autoComplete="current-password" dir="ltr" /></label>
              <button className="btn soft" disabled={busy}><KeyRound size={14} />{t("save")}</button>
            </form>
            {workerSaved && <p className="form-hint" role="status">{t("workerLoginSaved", { phone: workerSaved })}</p>}
          </section>
        )}

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
