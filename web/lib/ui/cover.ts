// Home covers: original dot-matrix pictures, so a home reads as a place rather than a table row
// when an operator has no photos. Pure and deterministic: a home keeps its picture forever.

export const COVER_W = 40;
export const COVER_H = 24;

export const SCENES = ["villa", "loft", "cottage", "cabin", "townhouse", "beach"] as const;
export type Scene = (typeof SCENES)[number];

export type Palette = { bg: string };

const PALETTES: readonly Palette[] = [
  { bg: "#0a5fd6" }, // signal blue
  { bg: "#b9482a" }, // terracotta
  { bg: "#0f6e68" }, // deep teal
  { bg: "#9a6a12" }, // ochre
  { bg: "#6a3a70" }, // plum
  { bg: "#2c6a4c" }, // pine
];

const WORDS: readonly [RegExp, Scene][] = [
  [/\b(sea|seaside|beach|shore|coast|bay|surf|ocean)\b/, "beach"],
  [/\b(loft|apartment|apt|studio|flat|penthouse|tower)\b/, "loft"],
  [/\b(cabin|lodge|chalet|pine|mountain|forest)\b/, "cabin"],
  [/\b(row|terrace|townhouse|townhome|mews)\b/, "townhouse"],
  [/\b(cottage|bungalow|farmhouse)\b/, "cottage"],
  [/\b(casa|villa|hacienda|finca)\b/, "villa"],
];

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

export function coverFor(name: string): { scene: Scene; palette: Palette } {
  const key = name.trim().toLowerCase();
  const h = hash(key);
  const scene = WORDS.find(([re]) => re.test(key))?.[1] ?? SCENES[h % SCENES.length];
  return { scene, palette: PALETTES[(h >>> 19) % PALETTES.length] }; // other bits than the scene, so the two vary apart
}

const MID = 1;
const BRIGHT = 2;
const GLOW = 3;

class Canvas {
  readonly cells = new Uint8Array(COVER_W * COVER_H);
  set(x: number, y: number, v: number) {
    if (x >= 0 && x < COVER_W && y >= 0 && y < COVER_H) this.cells[y * COVER_W + x] = v;
  }
  rect(x: number, y: number, w: number, h: number, v: number) {
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, v);
  }
  /** A triangle pointing up: apex at (cx, top), widening one cell per row. */
  gable(cx: number, top: number, rows: number, v: number) {
    for (let r = 0; r < rows; r++) this.rect(cx - r, top + r, r * 2 + 1, 1, v);
  }
  disc(cx: number, cy: number, r: number, v: number) {
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r) this.set(cx + x, cy + y, v);
  }
  ground(y = 21) {
    this.rect(0, y, COVER_W, COVER_H - y, MID);
  }
  palm(x: number, base: number, height: number) {
    this.rect(x, base - height, 1, height, MID);
    const top = base - height;
    for (let i = 1; i <= 4; i++) {
      this.set(x - i, top + (i > 2 ? 1 : 0), MID);
      this.set(x + i, top + (i > 2 ? 1 : 0), MID);
    }
    this.set(x - 1, top - 1, MID);
    this.set(x + 1, top - 1, MID);
  }
  pine(cx: number, base: number) {
    this.gable(cx, base - 11, 5, MID);
    this.gable(cx, base - 8, 6, MID);
    this.rect(cx, base - 3, 1, 3, MID);
  }
}

const DRAW: Record<Scene, (c: Canvas) => void> = {
  villa(c) {
    c.disc(7, 5, 2, GLOW);
    c.ground();
    c.rect(9, 10, 22, 11, BRIGHT);
    c.rect(7, 8, 26, 2, MID);
    c.rect(13, 3, 8, 5, BRIGHT);
    c.rect(12, 2, 10, 1, MID);
    c.rect(15, 5, 2, 2, GLOW);
    c.rect(18, 5, 2, 2, GLOW);
    for (const x of [12, 17, 26]) c.rect(x, 13, 3, 4, GLOW);
    c.rect(22, 14, 3, 7, 0);
    c.rect(23, 13, 1, 1, 0);
    c.palm(35, 21, 11);
  },
  loft(c) {
    c.ground();
    c.rect(3, 10, 8, 11, MID);
    c.rect(29, 7, 8, 14, MID);
    c.rect(12, 2, 16, 19, BRIGHT);
    for (let y = 4; y < 17; y += 3) for (let x = 14; x < 26; x += 3) c.rect(x, y, 2, 2, (x + y) % 2 ? GLOW : 0);
    c.rect(18, 18, 4, 3, 0);
    for (const [x, y] of [[5, 12], [8, 15], [31, 10], [34, 14]] as const) c.rect(x, y, 2, 2, GLOW);
  },
  cottage(c) {
    c.disc(33, 5, 2, GLOW);
    c.ground();
    c.rect(26, 4, 2, 6, MID);
    c.gable(19, 3, 9, MID);
    c.rect(11, 12, 17, 9, BRIGHT);
    c.rect(18, 15, 3, 6, 0);
    c.rect(13, 14, 3, 3, GLOW);
    c.rect(23, 14, 3, 3, GLOW);
    c.disc(5, 15, 4, MID);
    c.rect(5, 18, 1, 3, MID);
  },
  cabin(c) {
    c.disc(8, 4, 2, GLOW);
    c.rect(9, 3, 2, 2, 0);
    c.ground();
    c.pine(5, 21);
    c.pine(35, 21);
    c.gable(20, 4, 17, BRIGHT);
    c.gable(20, 11, 7, GLOW);
    c.rect(20, 11, 1, 7, BRIGHT);
    c.rect(14, 16, 13, 1, BRIGHT);
    c.rect(18, 18, 5, 3, 0);
  },
  townhouse(c) {
    c.disc(34, 4, 2, GLOW);
    c.ground();
    const homes = [
      [3, 8, 7],
      [11, 5, 9],
      [21, 9, 7],
      [29, 6, 8],
    ] as const;
    for (const [x, top, w] of homes) {
      c.rect(x, top, w, 21 - top, BRIGHT);
      c.rect(x, top - 1, w, 1, MID);
      for (let y = top + 2; y < 16; y += 4) {
        c.rect(x + 1, y, 2, 2, GLOW);
        c.rect(x + w - 3, y, 2, 2, GLOW);
      }
      c.rect(x + Math.floor(w / 2) - 1, 17, 2, 4, 0);
    }
  },
  beach(c) {
    c.disc(31, 7, 4, GLOW);
    c.gable(13, 5, 7, MID);
    c.rect(8, 12, 11, 5, BRIGHT);
    c.rect(11, 13, 2, 2, GLOW);
    c.rect(15, 13, 2, 4, 0);
    for (const x of [9, 17]) c.rect(x, 17, 1, 3, MID);
    c.palm(23, 20, 9);
    for (let y = 20; y < COVER_H; y++) for (let x = 0; x < COVER_W; x++) if ((x + y * 3) % 7 < 5) c.set(x, y, y % 2 ? MID : BRIGHT);
  },
};

export type CoverPaths = { mid: string; bright: string; glow: string };

// Each row is one dashed stroke per run of same-toned cells, so a cover is about 1 KB and can repeat
// on every table row. The dash leaves the gaps between dots; COVER_DOT is the dot's size.
export const COVER_DOT = 0.78;
export const COVER_DASH = `${COVER_DOT} ${(1 - COVER_DOT).toFixed(2)}`;
const GAP = 1 - COVER_DOT;
const runPath = (x: number, y: number, cells: number) => `M${x} ${y}.5h${(cells - GAP).toFixed(2)}`;

const cache = new Map<Scene, CoverPaths>();

export function coverPaths(scene: Scene): CoverPaths {
  const hit = cache.get(scene);
  if (hit) return hit;
  const c = new Canvas();
  DRAW[scene](c);
  const out: Record<number, string> = { [MID]: "", [BRIGHT]: "", [GLOW]: "" };
  for (let y = 0; y < COVER_H; y++) {
    for (let x = 0; x < COVER_W; ) {
      const v = c.cells[y * COVER_W + x];
      let end = x + 1;
      while (end < COVER_W && c.cells[y * COVER_W + end] === v) end++;
      if (v) out[v] += runPath(x, y, end - x);
      x = end;
    }
  }
  const paths = { mid: out[MID], bright: out[BRIGHT], glow: out[GLOW] };
  cache.set(scene, paths);
  return paths;
}

/** The unlit cells behind every picture. */
export const COVER_GRID = Array.from({ length: COVER_H }, (_, y) => `M0 ${y}.5H${COVER_W}`).join("");
