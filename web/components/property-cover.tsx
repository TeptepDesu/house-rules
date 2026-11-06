import { COVER_DASH, COVER_DOT, COVER_GRID, COVER_H, COVER_W, coverFor, coverPaths } from "@/lib/ui/cover";
import { cn } from "@/lib/utils";

/** A home's dot-matrix picture. Decorative: the home's name is always next to it as real text. */
export function PropertyCover({ name, className, ...props }: { name: string } & Omit<React.ComponentProps<"div">, "children">) {
  const { scene, palette } = coverFor(name);
  const p = coverPaths(scene);
  return (
    <div aria-hidden data-scene={scene} className={cn("overflow-hidden", className)} style={{ backgroundColor: palette.bg }} {...props}>
      <svg viewBox={`0 0 ${COVER_W} ${COVER_H}`} preserveAspectRatio="xMidYMid slice" className="block size-full">
        <g transform="translate(.11 0)" fill="none" strokeWidth={COVER_DOT} strokeDasharray={COVER_DASH}>
          <path d={COVER_GRID} stroke="#fff" strokeOpacity={0.1} />
          <path d={p.mid} stroke="#fff" strokeOpacity={0.42} />
          <path d={p.bright} stroke="#fbf6e9" />
          <path d={p.glow} stroke="#ffd27a" />
        </g>
      </svg>
    </div>
  );
}
