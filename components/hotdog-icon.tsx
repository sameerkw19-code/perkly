// Hot dog stamp icon, drawn in the same style as the lucide icons (24×24, stroke, round ends),
// because lucide has no hot dog. Takes the same props the stamp icons are given.
export function HotDog({ size = 24, color = "currentColor", strokeWidth = 2, ...rest }: { size?: number; color?: string; strokeWidth?: number } & React.SVGProps<SVGSVGElement>) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color}
      strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <g transform="rotate(-35 12 12)">
        <path d="M5.5 10.2C6.5 8.2 8.2 7 10.5 7h3c2.3 0 4 1.2 5 3.2" />
        <path d="M5.5 13.8c1 2 2.7 3.2 5 3.2h3c2.3 0 4-1.2 5-3.2" />
        <rect x="1.5" y="10" width="21" height="4" rx="2" />
      </g>
    </svg>
  );
}
