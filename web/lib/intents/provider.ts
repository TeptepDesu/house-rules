// Which 1Click to use. mock: in-process fake (default outside production). live: the real API.
// Production refuses mock, like it refuses PGlite.

export type OneClickMode = "mock" | "live";

export function oneClickMode(env: Record<string, string | undefined> = process.env): OneClickMode {
  const want = env.ONECLICK_MODE;
  if (env.NODE_ENV === "production") {
    if (want === "mock") throw new Error("ONECLICK_MODE=mock is not allowed in production");
    return "live";
  }
  return want === "live" ? "live" : "mock";
}
