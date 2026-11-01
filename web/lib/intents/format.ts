/** Token base units → human string, trimming trailing zeros ("125600000", 6 → "125.6"). Max 8 decimals shown. */
export function formatUnits(raw: string, decimals: number, maxFraction = 8): string {
  if (!/^\d+$/.test(raw)) throw new Error(`Invalid amount: ${raw}`);
  const s = raw.padStart(decimals + 1, "0");
  const whole = s.slice(0, s.length - decimals) || "0";
  let frac = decimals ? s.slice(s.length - decimals) : "";
  if (frac.length > maxFraction) {
    // round up so the guest never sends too little
    const cut = BigInt(frac.slice(0, maxFraction)) + (/[1-9]/.test(frac.slice(maxFraction)) ? 1n : 0n);
    if (cut >= 10n ** BigInt(maxFraction)) return formatUnits((BigInt(whole) + 1n).toString(), 0);
    frac = cut.toString().padStart(maxFraction, "0");
  }
  frac = frac.replace(/0+$/, "");
  return frac ? `${BigInt(whole)}.${frac}` : `${BigInt(whole)}`;
}
