// Testimonials. Add only real quotes, with the business's written permission.
// The section stays hidden while the list for a language is empty.
import type { Lang } from "./content";

type Quote = { text: string; name: string; business: string; city: string };

const QUOTES: Record<Lang, Quote[]> = { he: [], ar: [] };

const TITLE: Record<Lang, string> = { he: "מה אומרים בעלי העסקים", ar: "ماذا يقول أصحاب المشاريع" };

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
