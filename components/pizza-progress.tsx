import { assetUrl, type Design } from "../lib/design";
import { PIZZA_COLORS as C, slicePath, slicesPath, toppings } from "../lib/pizza";

// Fixed geometry in a 200×200 box, so every card uses the same shapes (and the same clip ids).
const CX = 100, CY = 100, R = 84;

/** A pizza with one slice per stamp; collected slices are shown, the rest dashed. Full pizza gets a gold ring. */
export function PizzaProgress({ design, stamps, target, label }: { design: Design; stamps: number; target: number; label?: string }) {
  const k = Math.max(0, Math.min(target, stamps));
  const full = k >= target;
  const photo = design.progressImage ? assetUrl(design.progressImage) : null;
  const clip = `pz-clip-${target}-${k}`;
  return (
    <svg className="pizza-progress" viewBox="0 0 200 200" role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <defs>
        <radialGradient id="pz-cheese" cx="50%" cy="50%" r="60%">
          <stop offset="0" stopColor={C.cheeseLight} />
          <stop offset="1" stopColor={C.cheese} />
        </radialGradient>
        {photo && <clipPath id={clip}><path d={slicesPath(CX, CY, R, k, target)} /></clipPath>}
      </defs>
      <circle cx={CX} cy={CY} r={R + 12} fill="rgba(0,0,0,.28)" stroke={full ? C.gold : "currentColor"} strokeOpacity={full ? 1 : 0.25} strokeWidth={full ? 4 : 1.5} />
      {Array.from({ length: target }, (_, i) =>
        i < k ? null : <path key={i} d={slicePath(CX, CY, R, i, target)} fill="none" stroke="currentColor" strokeOpacity={0.4} strokeWidth={1.5} strokeDasharray="5 5" />,
      )}
      {photo ? (
        <>
          <image href={photo} x={CX - R} y={CY - R} width={R * 2} height={R * 2} preserveAspectRatio="xMidYMid slice" clipPath={`url(#${clip})`} />
          {Array.from({ length: k }, (_, i) => <path key={i} d={slicePath(CX, CY, R, i, target)} fill="none" stroke="rgba(0,0,0,.25)" strokeWidth={1.5} />)}
        </>
      ) : (
        Array.from({ length: k }, (_, i) => (
          <g key={i}>
            <path d={slicePath(CX, CY, R, i, target)} fill="url(#pz-cheese)" stroke={C.crust} strokeWidth={3} strokeLinejoin="round" />
            {toppings(CX, CY, R, i, target).map((s, j) => <circle key={j} cx={s.x} cy={s.y} r={s.r} fill={C.pepperoni} />)}
          </g>
        ))
      )}
    </svg>
  );
}
