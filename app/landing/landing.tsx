// Public marketing page (Hebrew at "/", Arabic at "/ar"). Copy lives in content.ts.
import "./landing.css";
import { COPY, hrefs, waLink, WHATSAPP_DISPLAY, type Lang } from "./content";
import { DemoPanel, ExamplesPicker, Logo, SiteNav, TiltStage } from "./landing-client";
import { Testimonials } from "./landing-parts";
import { CafeLogo, CardVisual, Icon, QrArt } from "./visuals";

const STEP_ICONS = ["palette", "qr", "stamp", "repeat"];

function Check() {
  return <Icon name="check" size={18} stroke={2.6} className="lp-check" />;
}

function HeroScene({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const [cafe, barber, , icecream] = c.examples.list;
  const d = c.demo;
  return (
    <div className="lp-hero-visual" role="img" aria-label={c.hero.sceneLabel}>
      <TiltStage className="lp-scene">
        <div className="lp-stage" aria-hidden="true">
          <div className="lp-glow" />
          <div className="lp-float lp-back lp-back-1">
            <CardVisual k="barber" name={barber.name} rewardLine={c.examples.rewardLine(barber.target, barber.reward)} target={barber.target} filled={barber.filled} footStart={`${barber.filled} ${d.of} ${barber.target}`} footEnd={d.left(barber.target - barber.filled, barber.reward)} size="sm" />
          </div>
          <div className="lp-float lp-back lp-back-2">
            <CardVisual k="icecream" name={icecream.name} rewardLine={c.examples.rewardLine(icecream.target, icecream.reward)} target={icecream.target} filled={icecream.filled} footStart={`${icecream.filled} ${d.of} ${icecream.target}`} footEnd={d.left(icecream.target - icecream.filled, icecream.reward)} size="sm" />
          </div>
          <div className="lp-phone">
            <div className="lp-phone-screen">
              <div className="lp-phone-bar">
                <span>{c.hero.myCard}</span>
                <span dir="ltr">perkly.shop</span>
              </div>
              <CardVisual k="cafe" name={cafe.name} rewardLine={c.examples.rewardLine(cafe.target, cafe.reward)} target={cafe.target} filled={cafe.filled} footStart={`${cafe.filled} ${d.of} ${cafe.target}`} footEnd={d.left(cafe.target - cafe.filled, cafe.reward)} size="sm" />
              <div className="lp-phone-qr">
                <QrArt size={92} />
                <span>{c.hero.qrCaption}</span>
              </div>
            </div>
          </div>
          <div className="lp-floor-shadow" />
        </div>
      </TiltStage>
    </div>
  );
}

function KitScene({ lang }: { lang: Lang }) {
  const k = COPY[lang].pricing.kit;
  const name = COPY[lang].examples.list[0].name;
  return (
    <div className="lp-kit-scene" role="img" aria-label={k.sceneLabel}>
      <div className="lp-kit-room" aria-hidden="true">
        <div className="lp-kit-wall" />
        <div className="lp-kit-counter" />
        <div className="lp-kit-item lp-poster lp-poster-a">
          <span className="lp-poster-brand"><CafeLogo size={26} />{name}</span>
          <strong>{k.poster1}</strong>
          <span className="lp-poster-qr"><QrArt size={58} /></span>
          <span className="lp-poster-cta">{k.scan}</span>
        </div>
        <div className="lp-kit-item lp-poster lp-poster-b">
          <CafeLogo size={30} />
          <strong>{k.poster2}</strong>
          <span className="lp-poster-dots"><i /><i /><i /><i className="off" /><i className="off" /></span>
          <QrArt size={50} />
        </div>
        <div className="lp-kit-item lp-stand">
          <div className="lp-stand-face">
            <CafeLogo size={24} />
            <span>{k.stand}</span>
            <QrArt size={52} />
          </div>
          <div className="lp-stand-base" />
        </div>
      </div>
    </div>
  );
}

function DashboardMock({ lang }: { lang: Lang }) {
  const m = COPY[lang].manage;
  const name = COPY[lang].examples.list[0].name;
  return (
    <div className="lp-dash" role="img" aria-label={`${m.demoLabel}: ${m.stats.map((s) => `${s.label} ${s.value}`).join(", ")}`}>
      <div aria-hidden="true">
        <div className="lp-dash-top">
          <span className="lp-dash-name"><CafeLogo size={28} />{name}</span>
          <span className="lp-chip lp-chip-yellow">{m.demoLabel}</span>
        </div>
        <div className="lp-dash-range">
          {m.range.map((r, i) => (
            <span key={r} className={i === 1 ? "is-on" : ""}>{r}</span>
          ))}
        </div>
        <div className="lp-dash-stats">
          {m.stats.map((s) => (
            <div key={s.label}>
              <span>{s.label}</span>
              <strong>{s.value}</strong>
            </div>
          ))}
        </div>
        <div className="lp-dash-alert"><Icon name="alert" size={18} />{m.alert}</div>
        <div className="lp-dash-cols">
          <div>
            <span className="lp-dash-sub">{m.staffTitle}</span>
            {m.staff.map((s) => (
              <div key={s.name} className="lp-dash-row"><span className="lp-avatar">{s.name.slice(0, 1)}</span><span><strong>{s.name}</strong> · {s.detail}</span></div>
            ))}
          </div>
          <div>
            <span className="lp-dash-sub">{m.recentTitle}</span>
            {m.recent.map((r) => (
              <div key={r.text} className="lp-dash-row lp-dash-row-split"><span>{r.text}</span><span className="lp-muted">{r.time}</span></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing({ lang }: { lang: Lang }) {
  const c = COPY[lang];
  const h = hrefs(lang);
  return (
    <div className="lp" lang={lang} dir={c.dir}>
      <a href="#main" className="lp-skip">{c.nav.skip}</a>
      <SiteNav lang={lang} />

      <main id="main" className="lp-main">
        {/* Hero */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-wrap lp-hero-grid">
            <div className="lp-hero-text">
              <span className="lp-chip">{c.hero.badge}</span>
              <h1 id="hero-title" className="lp-h1">{c.hero.title}</h1>
              <p className="lp-lead">{c.hero.text}</p>
              <div className="lp-hero-ctas">
                <a href={h.signup} className="lp-btn lp-btn-primary lp-btn-lg">{c.hero.cta}<Icon name={c.dir === "rtl" ? "arrowLeft" : "arrowRight"} size={20} stroke={2.4} /></a>
                <a href="#demo" className="lp-btn lp-btn-ghost lp-btn-lg">{c.hero.demo}</a>
              </div>
              <p className="lp-hero-price"><strong>{c.hero.price}</strong><span aria-hidden="true">·</span><span>{c.hero.priceNote}</span></p>
              <ul className="lp-hero-points">
                {c.hero.points.map((p) => (
                  <li key={p}><Check />{p}</li>
                ))}
              </ul>
            </div>
            <HeroScene lang={lang} />
          </div>
        </section>

        {/* How it works + live demo */}
        <section id="how" className="lp-section lp-tint" aria-labelledby="how-title">
          <div className="lp-wrap">
            <span className="lp-eyebrow">{c.how.eyebrow}</span>
            <h2 id="how-title" className="lp-h2">{c.how.title}</h2>
            <div className="lp-how-grid">
              <div className="lp-how-steps">
                <ol className="lp-steps">
                  {c.how.steps.map((s, i) => (
                    <li key={s.title}>
                      <span className="lp-step-icon" aria-hidden="true"><Icon name={STEP_ICONS[i]} size={22} /></span>
                      <span className="lp-step-text">
                        <strong><span className="lp-step-num">{i + 1}.</span> {s.title}</strong>
                        <span>{s.text}</span>
                      </span>
                    </li>
                  ))}
                </ol>
                <div className="lp-rule">
                  <strong>{c.how.ruleTitle}</strong>
                  <p>{c.how.rule}</p>
                </div>
              </div>
              <DemoPanel lang={lang} />
            </div>
          </div>
        </section>

        {/* Examples */}
        <section id="examples" className="lp-section" aria-labelledby="examples-title">
          <div className="lp-wrap lp-split">
            <div className="lp-split-text">
              <span className="lp-eyebrow">{c.examples.eyebrow}</span>
              <h2 id="examples-title" className="lp-h2">{c.examples.title}</h2>
              <p className="lp-body">{c.examples.text}</p>
              <p className="lp-small lp-muted">{c.examples.note}</p>
            </div>
            <ExamplesPicker lang={lang} />
          </div>
        </section>

        {/* Owner dashboard */}
        <section className="lp-section lp-dark" aria-labelledby="manage-title">
          <div className="lp-wrap lp-split lp-split-wide">
            <div className="lp-split-text">
              <span className="lp-eyebrow lp-eyebrow-yellow">{c.manage.eyebrow}</span>
              <h2 id="manage-title" className="lp-h2">{c.manage.title}</h2>
              <p className="lp-body">{c.manage.text}</p>
              <ul className="lp-list">
                {c.manage.points.map((p) => (
                  <li key={p}><Check />{p}</li>
                ))}
              </ul>
              <h3 className="lp-h3"><Icon name="shield" size={20} />{c.manage.controlsTitle}</h3>
              <ul className="lp-list">
                {c.manage.controls.map((p) => (
                  <li key={p}><Check />{p}</li>
                ))}
              </ul>
            </div>
            <DashboardMock lang={lang} />
          </div>
        </section>

        <Testimonials lang={lang} />

        {/* Trust: honest pilot status and a personal call */}
        <section className="lp-section lp-section-tight" aria-labelledby="trust-title">
          <div className="lp-wrap">
            <div className="lp-trust">
              <div>
                <h2 id="trust-title" className="lp-h3 lp-trust-title">{c.trust.title}</h2>
                <p className="lp-body">{c.trust.text}</p>
              </div>
              <a href={waLink(c.trust.waText)} className="lp-btn lp-btn-dark" target="_blank" rel="noopener noreferrer">
                <Icon name="message" size={18} />{c.trust.cta}
              </a>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="lp-section lp-tint" aria-labelledby="pricing-title">
          <div className="lp-wrap">
            <span className="lp-eyebrow">{c.pricing.eyebrow}</span>
            <h2 id="pricing-title" className="lp-h2">{c.pricing.title}</h2>
            <div className="lp-pricing">
              <article className="lp-price-card lp-price-main" aria-labelledby="plan-sub">
                <h3 id="plan-sub" className="lp-price-name">{c.pricing.sub.name}</h3>
                <p className="lp-price"><strong>{c.pricing.sub.price}</strong><span>{c.pricing.sub.per}</span></p>
                <p className="lp-price-note">{c.pricing.sub.note}</p>
                <ul className="lp-list">
                  {c.pricing.sub.features.map((f) => (
                    <li key={f}><Check />{f}</li>
                  ))}
                </ul>
                <a href={h.signup} className="lp-btn lp-btn-primary lp-btn-wide">{c.pricing.sub.cta}</a>
              </article>
              <article className="lp-price-card lp-price-kit" aria-labelledby="plan-kit">
                <KitScene lang={lang} />
                <div className="lp-kit-body">
                  <span className="lp-chip lp-chip-yellow">{c.pricing.kit.tag}</span>
                  <h3 id="plan-kit" className="lp-price-name">{c.pricing.kit.name}</h3>
                  <p className="lp-price"><strong>{c.pricing.kit.price}</strong><span>{c.pricing.kit.per}</span></p>
                  <ul className="lp-list">
                    {c.pricing.kit.items.map((f) => (
                      <li key={f}><Check />{f}</li>
                    ))}
                  </ul>
                  <p className="lp-price-note">{c.pricing.kit.noSub}</p>
                  <a href={waLink(c.pricing.kit.waText)} className="lp-btn lp-btn-dark lp-btn-wide" target="_blank" rel="noopener noreferrer">
                    <Icon name="message" size={18} />{c.pricing.kit.cta}
                  </a>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" className="lp-section" aria-labelledby="faq-title">
          <div className="lp-wrap lp-faq-wrap">
            <span className="lp-eyebrow">{c.faq.eyebrow}</span>
            <h2 id="faq-title" className="lp-h2">{c.faq.title}</h2>
            <div className="lp-faq">
              {c.faq.items.map((f) => (
                <details key={f.q}>
                  <summary>{f.q}<Icon name="plus" size={18} className="lp-faq-icon" /></summary>
                  <p>{f.a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        {/* Final call to action */}
        <section className="lp-section lp-section-tight" aria-labelledby="final-title">
          <div className="lp-wrap">
            <div className="lp-final">
              <h2 id="final-title" className="lp-h2">{c.final.title}</h2>
              <p className="lp-lead">{c.final.text}</p>
              <div className="lp-final-ctas">
                <a href={h.signup} className="lp-btn lp-btn-light lp-btn-lg">{c.final.cta}</a>
                <a href={waLink(c.trust.waText)} className="lp-final-support" target="_blank" rel="noopener noreferrer">
                  <Icon name="message" size={18} />{c.final.support} <bdi className="lp-num">{WHATSAPP_DISPLAY}</bdi>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-grid">
          <div className="lp-footer-brand">
            <Logo label="Perkly" />
            <span>{c.footer.tagline}</span>
            <a href={waLink(c.trust.waText)} target="_blank" rel="noopener noreferrer">{c.footer.support}&nbsp;<bdi className="lp-num">{WHATSAPP_DISPLAY}</bdi></a>
          </div>
          <nav aria-label={c.footer.nav} className="lp-footer-links">
            <a href={h.terms}>{c.footer.terms}</a>
            <a href={h.privacy}>{c.footer.privacy}</a>
            <a href={h.accessibility}>{c.footer.accessibility}</a>
            <a href={h.login}>{c.footer.login}</a>
          </nav>
          <span className="lp-footer-rights">{c.footer.rights}</span>
        </div>
      </footer>
    </div>
  );
}
