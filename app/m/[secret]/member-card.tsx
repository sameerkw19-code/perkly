"use client";
import "../../club/club.css";
import { useEffect, useState } from "react";
import { CircleAlert, CircleCheck, Wallet } from "lucide-react";
import { Brand } from "../../../components/brand";
import { useLang } from "../../../lib/i18n";
import { israelToday, memberStatus, readableOn, showDate } from "../../../lib/club";
import { CLUB_TEXT, fill } from "../../../lib/club-text";

type Card = { memberNo: number; name: string; plan: string | null; validUntil: string; club: string; color: string; logo: string | null };

/** Today and a running clock, set only in the browser so the page always shows the real moment. */
function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

export default function MemberCard({ card, secret, googleWallet, isIOS }: { card: Card | null; secret: string; googleWallet: boolean; isIOS: boolean }) {
  const { lang, dir } = useLang();
  const t = CLUB_TEXT[lang];
  const now = useNow();
  if (!card) {
    return (
      <div className="member-page" dir={dir}>
        <header className="member-top"><Brand /></header>
        <main id="main" className="member-main"><p className="club-empty">{t.cardNotFound}</p></main>
      </div>
    );
  }
  const status = memberStatus(card.validUntil, israelToday(now ?? new Date()));
  const fg = readableOn(card.color);
  const date = showDate(card.validUntil);
  const clock = now?.toLocaleTimeString("en-GB", { timeZone: "Asia/Jerusalem" });
  return (
    <div className="member-page" dir={dir}>
      <header className="member-top"><Brand /></header>
      <main id="main" className="member-main">
        <section className={`member-card ${status}`} style={{ background: card.color, color: fg }} aria-label={t.memberCard}>
          <div className="member-card-top">
            {card.logo && <img className="member-logo" src={`/api/asset/${card.logo}`} alt="" />}
            <span className="member-club"><span className="member-kind">{t.memberCard}</span>{card.club}</span>
          </div>
          <h1 className="member-name">{card.name}</h1>
          <dl className="member-facts">
            <div><dt>{t.memberNo}</dt><dd><bdi>{card.memberNo}</bdi></dd></div>
            {card.plan && <div><dt>{t.plan2}</dt><dd>{card.plan}</dd></div>}
            <div><dt>{t.validUntil}</dt><dd><bdi>{date}</bdi></dd></div>
          </dl>
        </section>
        <p className={`member-status ${status}`} role="status">
          {status === "expired" ? <CircleAlert size={22} aria-hidden="true" /> : <CircleCheck size={22} aria-hidden="true" />}
          {status === "expired" ? fill(t.expiredOn, { d: date }) : status === "expiring" ? t.statusExpiring : t.statusActive}
        </p>
        {clock && <p className="member-live"><i aria-hidden="true" />{fill(t.liveNow, { t: clock })}</p>}
        <p className="member-hint">{t.showAtDoor}</p>
        {googleWallet && (
          <a className="btn primary wide" href={`/api/wallet/club/${encodeURIComponent(secret)}`} target="_blank" rel="noreferrer"><Wallet size={16} />{t.addGoogle}</a>
        )}
        <p className="member-hint">{isIOS ? t.iosHint : t.otherHint}</p>
      </main>
    </div>
  );
}
