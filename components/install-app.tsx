"use client";
// "Add to home screen": the site opens like an app from an icon on the phone.
// Android/Chrome: the browser's own install prompt. iPhone (Safari): short instructions (Share → Add to Home Screen).
// Hidden when the site is already opened from the home screen.
import { useEffect, useState } from "react";
import { Smartphone, Share, X } from "lucide-react";

type InstallPrompt = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

export function InstallApp({ t }: { t: (k: string) => string }) {
  const [deferred, setDeferred] = useState<InstallPrompt | null>(null);
  const [ios, setIos] = useState(false);
  const [installed, setInstalled] = useState(true); // decided after mount (no window on the server)
  const [help, setHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const iPhone = /iphone|ipad|ipod/i.test(navigator.userAgent);
    // Updates after mount, from the browser (not available on the server).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInstalled(standalone);
    setIos(iPhone);
    const onPrompt = (e: Event) => { e.preventDefault(); setDeferred(e as InstallPrompt); };
    const onInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => { window.removeEventListener("beforeinstallprompt", onPrompt); window.removeEventListener("appinstalled", onInstalled); };
  }, []);

  if (installed || (!deferred && !ios)) return null;
  return (
    <div className="install-app">
      <button type="button" className="btn soft sx-wide" onClick={async () => {
        if (deferred) { await deferred.prompt(); await deferred.userChoice.catch(() => null); setDeferred(null); return; }
        setHelp(true);
      }}><Smartphone size={16} />{t("installApp")}</button>
      {help && (
        <div className="install-help" role="dialog" aria-label={t("installApp")}>
          <button type="button" className="icon-btn" aria-label={t("close")} onClick={() => setHelp(false)}><X size={16} /></button>
          <p><strong>{t("installApp")}</strong></p>
          <ol>
            <li>{t("installIos1")} <Share size={15} aria-hidden="true" /></li>
            <li>{t("installIos2")}</li>
            <li>{t("installIos3")}</li>
          </ol>
        </div>
      )}
    </div>
  );
}

/** The worker's phone number, remembered on their own phone after signing up or signing in. */
export const WORKER_PHONE_KEY = "perkly-worker-phone";
export function rememberWorkerPhone(phone: string) {
  try { localStorage.setItem(WORKER_PHONE_KEY, phone); } catch {}
}
export function rememberedWorkerPhone(): string {
  try { return localStorage.getItem(WORKER_PHONE_KEY) ?? ""; } catch { return ""; }
}
