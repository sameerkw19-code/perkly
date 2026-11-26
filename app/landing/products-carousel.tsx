"use client";
// The card types as a sideways carousel. Each card is drawn like a pass in Apple Wallet:
// logo and name with the member on top, the strip (stamps, a progress bar or the main value), two fields, the code.
import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, QrArt } from "./visuals";

type Field = { label: string; value: string };
export type ProductItem = {
  key: string; biz: string; fields: Field[]; name: string; fits: string; text: string; points: string[];
  face: { label: string; value: string; sub: string };
};
type Labels = { forLabel: string; memberLabel: string; member: string; prev: string; next: string; scrollHint: string };

const ICONS: Record<string, string> = {
  stamps: "stamp", cashback: "percent", average: "cart", appointments: "calendar", library: "book",
  pass: "ticket", gift: "gift", club: "crown", service: "wrench", coupon: "ticket", attendance: "check",
};

function Strip({ item }: { item: ProductItem }) {
  if (item.key === "stamps") {
    // The stamp card's strip is its stamps: 7 of 10, the last one a gift.
    return (
      <div className="lp-pass-dots" aria-hidden="true">
        {Array.from({ length: 10 }, (_, i) => (
          <span key={i} className={i < 7 ? "on" : i === 9 ? "gift" : ""}>
            {i < 7 ? <Icon name="coffee" size={15} /> : i === 9 ? <Icon name="gift" size={15} /> : null}
          </span>
        ))}
      </div>
    );
  }
  return (
    <div className="lp-pass-primary">
      <small>{item.face.label}</small>
      <b dir="auto">{item.face.value}</b>
      {item.key === "average" && <span className="lp-pass-bar" aria-hidden="true"><i style={{ width: "60%" }} /></span>}
      {item.key !== "average" && item.face.sub && <span className="lp-pass-sub">{item.face.sub}</span>}
    </div>
  );
}

export function PassMock({ item, labels }: { item: ProductItem; labels: Labels }) {
  return (
    <div className={"lp-pass lp-pass-" + item.key} aria-hidden="true">
      <div className="lp-pass-top">
        <span className="lp-pass-logo"><Icon name={ICONS[item.key] ?? "star"} size={16} /></span>
        <b className="lp-pass-biz">{item.biz}</b>
        <span className="lp-pass-hdr"><small>{labels.memberLabel}</small><span>{labels.member}</span></span>
      </div>
      <div className="lp-pass-strip"><Strip item={item} /></div>
      <div className="lp-pass-fields">
        {item.fields.slice(0, 2).map((f, i) => (
          <span key={f.label} className={i ? "end" : ""}><small>{f.label}</small><b dir="auto">{f.value}</b></span>
        ))}
      </div>
      <div className="lp-pass-code"><QrArt size={64} /></div>
    </div>
  );
}

export function ProductsCarousel({ items, labels, rtl }: { items: ProductItem[]; labels: Labels; rtl: boolean }) {
  const track = useRef<HTMLUListElement>(null);
  const [edge, setEdge] = useState({ start: true, end: false });
  const measure = useCallback(() => {
    const el = track.current;
    if (!el) return;
    // In right-to-left pages scrollLeft runs from 0 to negative values.
    const pos = Math.abs(el.scrollLeft);
    setEdge({ start: pos < 8, end: pos + el.clientWidth >= el.scrollWidth - 8 });
  }, []);
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const raf = requestAnimationFrame(measure);
    el.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("scroll", measure); window.removeEventListener("resize", measure); };
  }, [measure]);
  const go = (towardEnd: boolean) => {
    const el = track.current;
    if (!el) return;
    const slide = el.querySelector("li");
    const step = slide ? (slide as HTMLElement).offsetWidth + 20 : el.clientWidth * 0.8;
    const sign = (towardEnd ? 1 : -1) * (rtl ? -1 : 1);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollBy({ left: sign * step, behavior: reduce ? "auto" : "smooth" });
  };
  return (
    <div className="lp-carousel">
      <div className="lp-carousel-bar">
        <span className="lp-carousel-hint">{labels.scrollHint}</span>
        <div className="lp-carousel-arrows">
          <button type="button" className="lp-carousel-btn" onClick={() => go(false)} disabled={edge.start} aria-label={labels.prev}>
            <Icon name={rtl ? "chevronRight" : "chevronLeft"} size={20} />
          </button>
          <button type="button" className="lp-carousel-btn" onClick={() => go(true)} disabled={edge.end} aria-label={labels.next}>
            <Icon name={rtl ? "chevronLeft" : "chevronRight"} size={20} />
          </button>
        </div>
      </div>
      <ul ref={track} className="lp-carousel-track" tabIndex={0} aria-label={labels.scrollHint}>
        {items.map((p) => (
          <li key={p.key} className="lp-slide">
            <PassMock item={p} labels={labels} />
            <h3 className="lp-product-name">{p.name}</h3>
            <p className="lp-product-fits"><strong>{labels.forLabel}</strong> {p.fits}</p>
            <p className="lp-product-text">{p.text}</p>
            <ul className="lp-product-points">
              {p.points.map((x) => <li key={x}><Icon name="check" size={16} />{x}</li>)}
            </ul>
          </li>
        ))}
      </ul>
    </div>
  );
}
