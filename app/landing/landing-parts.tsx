// Testimonials. Add only real quotes, with the business's written permission.
// The section stays hidden while the list for a language is empty.
import type { Lang } from "./content";
import { PERKLY_SOCIAL } from "../../lib/perkly-social";
import { socialLinks } from "../../lib/social";
import { SocialIcon } from "../../lib/social-icon";

type Quote = { text: string; name: string; business: string; city: string };

const QUOTES: Record<Lang, Quote[]> = { he: [], ar: [], en: [] };

const TITLE: Record<Lang, string> = { he: "מה אומרים בעלי העסקים", ar: "ماذا يقول أصحاب المشاريع", en: "What business owners say" };

export function Testimonials({ lang }: { lang: Lang }) {
  const quotes = QUOTES[lang];
  if (quotes.length === 0) return null;
  return (
    <section className="lp-section" aria-labelledby="proof-title">
      <div className="lp-wrap">
        <h2 id="proof-title" className="lp-h2 lp-center">{TITLE[lang]}</h2>
        <div className="lp-quotes">
          {quotes.map((q, i) => (
            <figure key={i} className="lp-quote">
              <blockquote>&ldquo;{q.text}&rdquo;</blockquote>
              <figcaption>
                <strong>{q.name}</strong>
                <span>{q.business}, {q.city}</span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

const SOCIAL_LABEL: Record<Lang, string> = { he: "Perkly ברשתות", ar: "Perkly على الشبكات", en: "Perkly on social media" };
const WA_TEXT: Record<Lang, string> = { he: "היי, אשמח לשמוע על Perkly", ar: "مرحباً، أود أن أعرف المزيد عن Perkly", en: "Hi, I'd like to hear about Perkly" };

/** Perkly's own accounts (lib/perkly-social.ts). Hidden when none are set. */
export function SocialRow({ lang }: { lang: Lang }) {
  const links = socialLinks(PERKLY_SOCIAL, WA_TEXT[lang]);
  if (links.length === 0) return null;
  return (
    <nav aria-label={SOCIAL_LABEL[lang]} className="lp-social">
      {links.map((l) => (
        <a key={l.key} href={l.url} target="_blank" rel="noopener noreferrer" aria-label={l.label} title={l.label}>
          <SocialIcon name={l.key} size={20} />
        </a>
      ))}
    </nav>
  );
}
