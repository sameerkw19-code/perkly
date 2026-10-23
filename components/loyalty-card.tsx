import { Coffee, Gift } from "lucide-react";

type Props = {
  businessName: string;
  reward: string;
  color: string;
  stamps: number;
  target: number;
  customerName?: string | null;
  t: (key: string, vars?: Record<string, string | number>) => string;
  large?: boolean;
};

/** Numbers like "3/9" must keep left-to-right order inside Hebrew/Arabic text. */
export function Num({ children }: { children: React.ReactNode }) {
  return (
    <bdi dir="ltr" style={{ unicodeBidi: "isolate", fontVariantNumeric: "tabular-nums" }}>
      {children}
    </bdi>
  );
}

export function LoyaltyCard({ businessName, reward, color, stamps, target, customerName, t, large }: Props) {
  const ready = stamps >= target;
  const left = Math.max(0, target - stamps);
  const columns = target + 1 <= 6 ? target + 1 : Math.ceil((target + 1) / 2);
  return (
    <div className={"loyalty-card" + (large ? " large" : "")} style={{ "--card-color": color } as React.CSSProperties}>
      <div className="card-top">
        <span className="card-mark"><Coffee size={20} /></span>
        <strong>{businessName}</strong>
        {customerName ? (
          <span className="card-customer">
            <small>{t("customerName")}</small>
            <b>{customerName}</b>
          </span>
        ) : null}
      </div>
      <div className="card-title">{reward}</div>
      <div className="card-progress">
        <span><Num>{stamps}/{target}</Num></span>
        <span>{ready ? t("earned") : t("toGo", { k: left })}</span>
      </div>
      <div className="stamp-grid" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
        {Array.from({ length: target }, (_, i) => (
          <span key={i} className={"stamp" + (i < stamps ? " filled" : "")} aria-hidden="true">
            {i < stamps ? <Coffee size={18} /> : <Num>{i + 1}</Num>}
          </span>
        ))}
        <span className={"stamp gift" + (ready ? " filled" : "")} aria-hidden="true"><Gift size={18} /></span>
      </div>
      <p className="sr-only">{t("stampsOf", { n: stamps, t: target })}</p>
    </div>
  );
}
