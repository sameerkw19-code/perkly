import { Globe } from "lucide-react";
import { BRAND_PATHS } from "./brand-icons";
import type { SocialKey } from "./social";

export function SocialIcon({ name, size = 22, color = "currentColor" }: { name: SocialKey; size?: number; color?: string }) {
  if (name === "website") return <Globe size={size} color={color} aria-hidden="true" />;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <path d={BRAND_PATHS[name]} />
    </svg>
  );
}
