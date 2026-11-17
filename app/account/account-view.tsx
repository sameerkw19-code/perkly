"use client";
import { useState } from "react";
import { ArrowRight, KeyRound, LogOut, Mail, Phone, Trash2, UserRound } from "lucide-react";
import { errorText, useLang } from "../../lib/i18n";
import { post } from "../../lib/api";
import { LangSwitch } from "../../components/lang-switch";
import { Brand } from "../../components/brand";
import { rememberWorkerPhone } from "../../components/install-app";

// Keeps a phone number left-to-right inside Hebrew or Arabic text.
const ltr = (s: string) => `\u2066${s}\u2069`;

export default function AccountView({ name, email, staffIn = [], phone = "", workerPhone = "" }: { name: string; email: string; staffIn?: { id: string; name: string }[]; phone?: string; workerPhone?: string }) {
  const { lang, setLang, t, dir } = useLang();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [workerSaved, setWorkerSaved] = useState("");
  const [myEmail, setMyEmail] = useState(email);
  const [myPhone, setMyPhone] = useState(phone);
  const [phoneMsg, setPhoneMsg] = useState("");
  const [phoneError, setPhoneError] = useState("");
  const [myWorkerPhone, setMyWorkerPhone] = useState(workerPhone);
  const [wpMsg, setWpMsg] = useState("");
  const [wpError, setWpError] = useState("");

  async function savePhone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const data = new FormData(e.currentTarget);
    setBusy(true); setPhoneError(""); setPhoneMsg("");
    const r = await post("/api/auth", { action: "set_phone", phone: data.get("contactPhone") });
    if (r.ok) { setMyPhone(r.data.phone); setPhoneMsg(r.data.phone ? t("phoneSaved", { phone: ltr(r.data.phone) }) : t("phoneCleared")); }
    else setPhoneError(errorText(lang, r.code));
    setBusy(false);
  }

  async function changeWorkerPhone(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true); setWpError(""); setWpMsg("");
    const r = await post("/api/auth", { action: "change_worker_phone", phone: data.get("newWorkerPhone"), password: data.get("wpPassword") });
    if (r.ok) { setMyWorkerPhone(r.data.workerPhone); setWpMsg(t("workerLoginSaved", { phone: ltr(r.data.workerPhone) })); rememberWorkerPhone(String(data.get("newWorkerPhone"))); form.reset(); }
    else setWpError(errorText(lang, r.code));
    setBusy(false);
  }
  const [emailStep, setEmailStep] = useState<{ challenge: string; sentTo: string } | null>(null);
  const [emailMsg, setEmailMsg] = useState("");
  const [emailError, setEmailError] = useState("");

  async function startEmailChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setBusy(true);
    setEmailError("");
    setEmailMsg("");
    const r = await post("/api/auth", { action: "change_email_start", email: data.get("newEmail"), password: data.get("emailPassword") });
    if (r.ok && r.data.changed) { setMyEmail(r.data.email); setEmailMsg(t("emailChanged", { email: r.data.email })); form.reset(); }
    else if (r.ok) setEmailStep({ challenge: r.data.challenge, sentTo: r.data.sentTo });
    else setEmailError(errorText(lang, r.code));
    setBusy(false);
  }

  async function confirmEmailChange(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !emailStep) return;
    const data = new FormData(e.currentTarget);
    setBusy(true);
    setEmailError("");
    const r = await post("/api/auth", { action: "change_email_confirm", challenge: emailStep.challenge, code: data.get("emailCode") });
    if (r.ok) { setMyEmail(r.data.email); setEmailMsg(t("emailChanged", { email: r.data.email })); setEmailStep(null); }
    else setEmailError(errorText(lang, r.code));
    setBusy(false);
  }

  async function saveWorkerLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    const r = await post("/api/auth", { action: "set_worker_login", phone: form.get("phone"), birthDate: form.get("birthDate"), password: form.get("password") });
    if (r.ok) { setWorkerSaved(r.data.workerPhone); setMyWorkerPhone(r.data.workerPhone); rememberWorkerPhone(String(form.get("phone"))); e.currentTarget.reset(); }
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
        <p><strong>{name}</strong><br /><span dir="ltr">{myEmail}</span></p>

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
            {workerSaved && <p className="form-hint" role="status">{t("workerLoginSaved", { phone: ltr(workerSaved) })}</p>}
            {myWorkerPhone && (
              <>
                <h3 className="account-sub">{t("workerPhoneChange")}</h3>
                <p className="form-hint">{t("workerPhoneNow", { phone: ltr(myWorkerPhone) })}</p>
                <form className="stack-form" onSubmit={changeWorkerPhone}>
                  <label>{t("newPhone")}<input id="newWorkerPhone" name="newWorkerPhone" type="tel" required maxLength={20} autoComplete="tel" dir="ltr" /></label>
                  <label>{t("currentPassword")}<input id="wpPassword" name="wpPassword" type="password" required maxLength={200} autoComplete="current-password" dir="ltr" /></label>
                  <button className="btn soft" disabled={busy}><Phone size={14} />{t("save")}</button>
                </form>
                {wpError && <p className="form-error" role="alert">{wpError}</p>}
                {wpMsg && <p className="form-hint" role="status">{wpMsg}</p>}
              </>
            )}
          </section>
        )}

        <section aria-labelledby="sec-email">
          <h2 id="sec-email">{t("emailTitle")}</h2>
          <p className="form-hint">{t("emailHint")}</p>
          {!emailStep ? (
            <form className="stack-form" onSubmit={startEmailChange}>
              <label>{t("newEmail")}<input id="newEmail" name="newEmail" type="email" required maxLength={200} autoComplete="email" dir="ltr" /></label>
              <label>{t("currentPassword")}<input id="emailPassword" name="emailPassword" type="password" required maxLength={200} autoComplete="current-password" dir="ltr" /></label>
              <button className="btn soft" disabled={busy}><Mail size={14} />{busy ? t("sending") : t("sendEmailCode")}</button>
            </form>
          ) : (
            <form className="stack-form" onSubmit={confirmEmailChange}>
              <p className="form-hint" role="status">{t("emailCodeSent", { to: emailStep.sentTo })}</p>
              <label>{t("emailCode")}<input id="emailCode" name="emailCode" required inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="[0-9]{6}" dir="ltr" className="code-input" autoFocus /></label>
              <button className="btn primary" disabled={busy}>{busy ? t("sending") : t("confirmEmail")}</button>
              <button type="button" className="text-btn" onClick={() => { setEmailStep(null); setEmailError(""); }}>{t("cancel")}</button>
            </form>
          )}
          {emailError && <p className="form-error" role="alert">{emailError}</p>}
          {emailMsg && <p className="form-hint" role="status">{emailMsg}</p>}
        </section>

        <section aria-labelledby="sec-phone">
          <h2 id="sec-phone">{t("contactPhoneTitle")}</h2>
          <p className="form-hint">{t("contactPhoneHint")}</p>
          <form className="stack-form" onSubmit={savePhone}>
            <label>{t("phone")}<input id="contactPhone" name="contactPhone" type="tel" maxLength={20} autoComplete="tel" dir="ltr" defaultValue={myPhone} key={myPhone} /></label>
            <button className="btn soft" disabled={busy}><Phone size={14} />{t("save")}</button>
          </form>
          {phoneError && <p className="form-error" role="alert">{phoneError}</p>}
          {phoneMsg && <p className="form-hint" role="status">{phoneMsg}</p>}
        </section>

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
