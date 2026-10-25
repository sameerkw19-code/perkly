"use client";
/* eslint-disable @next/next/no-html-link-for-pages -- plain links on purpose: client-side navigation breaks on this server */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { COPY, hrefs, type Lang } from "./content";
import { CardVisual, Icon } from "./visuals";

/** Remember the language for the app pages (login, sign-up), which read this key. */
function rememberLang(lang: Lang) {
  try {
    localStorage.setItem("perkly-language", lang);
  } catch {}
}

export function Logo({ label }: { label: string }) {
  return (
    <span className="lp-logo" aria-label={label}>
      <span className="lp-logo-mark" aria-hidden="true"><Icon name="gift" size={21} stroke={2.2} /></span>
      <span className="lp-logo-word" aria-hidden="true">Perkly</span>
    </span>
  );
}

export function SiteNav({ lang }: { lang: Lang }) {
  const c = COPY[lang].nav;
  const h = hrefs(lang);
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const links = [
    { href: "#how", label: c.how },
    { href: "#examples", label: c.examples },
    { href: "#pricing", label: c.pricing },
    { href: "#faq", label: c.faq },
  ];
  const langLinks = (
    <span className="lp-langs" role="group" aria-label={c.lang}>
      <a href="/" lang="he" hrefLang="he" aria-current={lang === "he" ? "true" : undefined} onClick={() => rememberLang("he")}>עברית</a>
      <a href="/ar" lang="ar" hrefLang="ar" aria-current={lang === "ar" ? "true" : undefined} onClick={() => rememberLang("ar")}>العربية</a>
      <a href="/en" lang="en" hrefLang="en" aria-current={lang === "en" ? "true" : undefined} onClick={() => rememberLang("en")}>English</a>
    </span>
  );

  return (
    <header className="lp-header">
      <div className="lp-wrap lp-header-row">
        <a href={h.home} className="lp-home-link"><Logo label={c.home} /></a>
        <nav aria-label="Perkly" className="lp-nav-desktop">
          {links.map((l) => (
            <a key={l.href} href={l.href}>{l.label}</a>
          ))}
        </nav>
        <div className="lp-header-actions">
          <span className="lp-only-desktop">{langLinks}</span>
          <a href={h.login} className="lp-login lp-only-desktop">{c.login}</a>
          <a href={h.signup} className="lp-btn lp-btn-dark lp-btn-sm">{c.cta}</a>
          <button
            ref={buttonRef}
            type="button"
            className="lp-menu-btn"
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? c.close : c.menu}
            onClick={() => setOpen((v) => !v)}
          >
            <Icon name={open ? "x" : "menu"} size={22} />
          </button>
        </div>
      </div>
      <div id={menuId} className="lp-mobile-menu" hidden={!open}>
        <nav aria-label="Perkly" className="lp-wrap">
          {links.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)}>{l.label}</a>
          ))}
          <a href={h.login} onClick={() => setOpen(false)}>{c.login}</a>
          {langLinks}
        </nav>
      </div>
    </header>
  );
}

/** Gentle tilt toward the mouse on desktop. Off on touch screens and with reduced motion. */
export function TiltStage({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fine = window.matchMedia("(pointer: fine) and (min-width: 960px)");
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    let frame = 0;
    let target = { x: 0, y: 0 };
    const apply = () => {
      frame = 0;
      el.style.setProperty("--tilt-x", `${target.y * -5}deg`);
      el.style.setProperty("--tilt-y", `${target.x * 7}deg`);
    };
    const onMove = (e: PointerEvent) => {
      if (!fine.matches || reduced.matches) return;
      const r = el.getBoundingClientRect();
      if (e.clientY < r.top - 200 || e.clientY > r.bottom + 200) return;
      target = {
        x: Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (r.width / 2 + 200))),
        y: Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (r.height / 2 + 200))),
      };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    const onLeave = () => {
      target = { x: 0, y: 0 };
      if (!frame) frame = requestAnimationFrame(apply);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("pointerleave", onLeave);
    return () => {
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerleave", onLeave);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}

const START = 7;
const TARGET = 10;

function StampDemo({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const d = c.demo;
  const ex = c.examples.list[0];
  const [count, setCount] = useState(START);
  const [press, setPress] = useState(0);
  const [toast, setToast] = useState(false);
  const [live, setLive] = useState("");
  const full = count >= TARGET;
  const toastTimer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  function add() {
    if (full) return;
    const next = count + 1;
    setCount(next);
    setPress((p) => p + 1);
    setToast(true);
    setLive(next >= TARGET ? d.liveReady : d.live(next, TARGET));
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(false), 1400);
  }
  function reset() {
    setCount(START);
    setToast(false);
    setLive(d.liveReset);
  }

  return (
    <div className="lp-demo">
      <div className="lp-demo-top">
        <span className="lp-chip lp-chip-yellow">{d.badge}</span>
      </div>
      <div className="lp-demo-card">
        <CardVisual
          k="cafe"
          name={ex.name}
          rewardLine={c.examples.rewardLine(TARGET, ex.reward)}
          target={TARGET}
          filled={count}
          pressed={press ? count - 1 : undefined}
          pressKey={press}
          footStart={`${count} ${d.of} ${TARGET}`}
          footEnd={full ? d.ready : d.left(TARGET - count, ex.reward)}
          size="lg"
          ready={full}
        />
        <span className={`lp-toast${toast ? " is-on" : ""}`} aria-hidden="true">
          <Icon name="check" size={16} stroke={3} /> {d.added}
        </span>
      </div>
      {full ? (
        <div className="lp-demo-ready">
          <strong>{d.readyTitle}</strong>
          <span>{d.readyText}</span>
          <button type="button" className="lp-btn lp-btn-dark" onClick={reset}>{d.reset}</button>
        </div>
      ) : (
        <div className="lp-demo-actions">
          <span className="lp-demo-intro">{d.intro}</span>
          <button type="button" className="lp-btn lp-btn-dark lp-btn-wide" onClick={add}>
            <Icon name="plus" size={18} stroke={3} className="lp-yellow-icon" /> {d.add}
          </button>
        </div>
      )}
      <p className="lp-sr-only" role="status" aria-live="polite">{live}</p>
    </div>
  );
}

function VideoDemo({ lang }: { lang: Lang }) {
  const v = COPY[lang].video;
  const [playing, setPlaying] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <figure className="lp-video">
      <div className="lp-video-frame">
        {playing && !failed ? (
          <video
            src="/videos/perkly-promo.mp4"
            poster="/videos/perkly-promo-poster.jpg"
            width={540}
            height={960}
            controls
            autoPlay
            muted
            playsInline
            onError={() => setFailed(true)}
          />
        ) : (
          <button type="button" className="lp-video-poster" onClick={() => setPlaying(true)} aria-label={v.play} disabled={failed}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/videos/perkly-promo-poster.jpg" alt="" width={540} height={960} />
            {!failed ? <span className="lp-play" aria-hidden="true"><Icon name="play" size={28} stroke={0} style={{ fill: "currentColor" }} /></span> : null}
          </button>
        )}
      </div>
      <figcaption>{failed ? v.error : v.caption}</figcaption>
    </figure>
  );
}

/** "Try it" stamp demo and the 20-second video, as tabs. */
export function DemoPanel({ lang }: { lang: Lang }) {
  const t = COPY[lang].how.tabs;
  const [tab, setTab] = useState<"try" | "video">("try");
  const base = useId();
  const tabs = [
    { id: "try" as const, label: t.try },
    { id: "video" as const, label: t.video },
  ];
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const next = tab === "try" ? "video" : "try";
    setTab(next);
    document.getElementById(`${base}-${next}-tab`)?.focus();
  };
  return (
    <div className="lp-demo-panel" id="demo">
      <div className="lp-tabs" role="tablist" aria-label={t.label} onKeyDown={onKey}>
        {tabs.map((x) => (
          <button
            key={x.id}
            id={`${base}-${x.id}-tab`}
            type="button"
            role="tab"
            aria-selected={tab === x.id}
            aria-controls={`${base}-${x.id}-panel`}
            tabIndex={tab === x.id ? 0 : -1}
            onClick={() => setTab(x.id)}
          >
            <Icon name={x.id === "try" ? "stamp" : "play"} size={16} /> {x.label}
          </button>
        ))}
      </div>
      <div id={`${base}-try-panel`} role="tabpanel" aria-labelledby={`${base}-try-tab`} hidden={tab !== "try"}>
        <StampDemo lang={lang} />
      </div>
      <div id={`${base}-video-panel`} role="tabpanel" aria-labelledby={`${base}-video-tab`} hidden={tab !== "video"}>
        {tab === "video" ? <VideoDemo lang={lang} /> : null}
      </div>
    </div>
  );
}

/** Pick a business type and see a large example card. Swipe on phones. */
export function ExamplesPicker({ lang }: { lang: Lang }) {
  const c = COPY[lang].examples;
  const d = COPY[lang].demo;
  const rtl = COPY[lang].dir === "rtl";
  const list = c.list;
  const [i, setI] = useState(0);
  const start = useRef<number | null>(null);
  const go = useCallback((n: number) => setI((n + list.length) % list.length), [list.length]);
  const ex = list[i];
  const left = ex.target - ex.filled;

  return (
    <div className="lp-examples">
      <div className="lp-example-chips" role="group" aria-label={c.pick}>
        {list.map((x, n) => (
          <button key={x.key} type="button" aria-pressed={n === i} onClick={() => setI(n)}>
            <Icon name={x.key === "cafe" ? "coffee" : x.key === "barber" ? "scissors" : x.key === "pizza" ? "pizza" : x.key === "icecream" ? "icecream" : x.key === "studio" ? "star" : "cake"} size={17} />
            {x.kind}
          </button>
        ))}
      </div>
      <div
        className="lp-example-stage"
        onPointerDown={(e) => {
          if (e.pointerType !== "mouse") start.current = e.clientX;
        }}
        onPointerUp={(e) => {
          if (start.current === null) return;
          const dx = e.clientX - start.current;
          start.current = null;
          if (Math.abs(dx) < 40) return;
          // Swipe toward the reading direction's end to move forward.
          go((rtl ? dx > 0 : dx < 0) ? i + 1 : i - 1);
        }}
      >
        <div className="lp-example-card" key={ex.key}>
          <CardVisual
            k={ex.key}
            name={ex.name}
            rewardLine={c.rewardLine(ex.target, ex.reward)}
            target={ex.target}
            filled={ex.filled}
            footStart={`${ex.filled} ${d.of} ${ex.target}`}
            footEnd={d.left(left, ex.reward)}
            size="lg"
          />
        </div>
      </div>
      <div className="lp-example-controls">
        <button type="button" className="lp-round-btn" onClick={() => go(i - 1)} aria-label={c.prev}><Icon name={rtl ? "chevronRight" : "chevronLeft"} size={20} /></button>
        <span className="lp-example-pos" aria-live="polite">{ex.kind} · {c.position(i + 1, list.length)}</span>
        <button type="button" className="lp-round-btn" onClick={() => go(i + 1)} aria-label={c.next}><Icon name={rtl ? "chevronLeft" : "chevronRight"} size={20} /></button>
      </div>
    </div>
  );
}
