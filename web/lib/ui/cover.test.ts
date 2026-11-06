import { describe, expect, it } from "vitest";
import { COVER_H, COVER_W, coverFor, coverPaths, SCENES } from "./cover";

describe("coverFor", () => {
  it("gives a home the same cover every time, whatever the casing", () => {
    expect(coverFor("Casa Azul")).toEqual(coverFor("casa azul"));
    expect(coverFor("Casa Azul")).toEqual(coverFor("  Casa Azul "));
  });

  it("picks a scene from the words in the name", () => {
    expect(coverFor("Casa Azul").scene).toBe("villa");
    expect(coverFor("Loft 21").scene).toBe("loft");
    expect(coverFor("Seaside Cottage").scene).toBe("beach");
    expect(coverFor("Rose Cottage").scene).toBe("cottage");
    expect(coverFor("Pine Cabin").scene).toBe("cabin");
    expect(coverFor("Harbour Row").scene).toBe("townhouse");
  });

  it("matches whole words, so a city name is not mistaken for the sea", () => {
    expect(coverFor("Seattle Loft").scene).toBe("loft");
    expect(coverFor("Shoreditch Flat").scene).toBe("loft");
    expect(coverFor("Bayswater Studio").scene).toBe("loft");
  });

  it("scene and colour vary independently for names with no scene word", () => {
    const covers = new Set(Array.from({ length: 200 }, (_, i) => {
      const c = coverFor(`Unit ${i}`);
      return `${c.scene}:${c.palette.bg}`;
    }));
    expect(covers.size).toBeGreaterThan(12);
  });

  it("still gives a name with no scene word a valid cover", () => {
    const c = coverFor("Unit 7");
    expect(SCENES).toContain(c.scene);
    expect(c.palette.bg).toMatch(/^#[0-9a-f]{6}$/);
  });

  it("copes with an empty name", () => {
    expect(SCENES).toContain(coverFor("").scene);
  });
});

describe("coverPaths", () => {
  // One subpath per horizontal run of cells: "M<x> <y>.5h<length>".
  const runs = (d: string) => [...d.matchAll(/M(\d+) (\d+)\.5h([\d.]+)/g)].map(([, x, y, len]) => ({ x: Number(x), y: Number(y), cells: Math.round(Number(len) + 0.22) }));

  it.each(SCENES)("%s draws a recognisable picture inside the grid", (scene) => {
    const p = coverPaths(scene);
    const cells = (d: string) => runs(d).reduce((a, r) => a + r.cells, 0);
    expect(cells(p.bright)).toBeGreaterThan(40); // the building itself
    expect(cells(p.glow)).toBeGreaterThan(0); // windows or a sun
    for (const d of [p.mid, p.bright, p.glow]) {
      for (const r of runs(d)) {
        expect(r.x + r.cells).toBeLessThanOrEqual(COVER_W);
        expect(r.y).toBeLessThan(COVER_H);
      }
    }
  });

  it.each(SCENES)("%s stays small enough to repeat on every table row", (scene) => {
    const p = coverPaths(scene);
    expect(p.mid.length + p.bright.length + p.glow.length).toBeLessThan(2_000);
  });

  it("every scene looks different", () => {
    expect(new Set(SCENES.map((s) => coverPaths(s).bright)).size).toBe(SCENES.length);
  });
});
