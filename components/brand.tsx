import { Gift } from "lucide-react";

/** The Perkly logo (gift mark + wordmark), the same one the public site uses. A link when `href` is given. */
export function Brand({ href, size = "md" }: { href?: string; size?: "sm" | "md" }) {
  const inner = (
    <>
      <span className="brand-mark" aria-hidden="true"><Gift size={size === "sm" ? 17 : 20} strokeWidth={2.2} /></span>
      <span className="brand-word">Perkly</span>
    </>
  );
  const cls = "brand" + (size === "sm" ? " brand-sm" : "");
  return href ? <a className={cls} href={href} aria-label="Perkly">{inner}</a> : <span className={cls} aria-label="Perkly">{inner}</span>;
}
