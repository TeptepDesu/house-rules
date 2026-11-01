// All money is bigint raw USDC units (6 decimals) end to end. This is the only place that
// turns raw amounts into display strings or parses user input. Never Number(raw), never floats.

export const USDC_DECIMALS = 6;
const SCALE = 10n ** BigInt(USDC_DECIMALS); // 1 USDC
const CENT = SCALE / 100n;

function group(intPart: bigint): string {
  return intPart.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/**
 * "$1,234.56". Rounds half-up to cents for display.
 * `exact: true` shows full precision ("$1.234567"), trimming zeros past the cents.
 */
export function formatUsd(raw: bigint, opts: { exact?: boolean } = {}): string {
  const sign = raw < 0n ? "-" : "";
  const abs = raw < 0n ? -raw : raw;
  if (opts.exact) {
    const frac = (abs % SCALE).toString().padStart(USDC_DECIMALS, "0").replace(/0+$/, "").padEnd(2, "0");
    return `${sign}$${group(abs / SCALE)}.${frac}`;
  }
  const cents = (abs + CENT / 2n) / CENT; // half-up
  return `${sign}$${group(cents / 100n)}.${(cents % 100n).toString().padStart(2, "0")}`;
}

const USD_INPUT = /^\$?(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,6}))?$/;

/** Parse operator input like "1,234.56" or "$800" into raw units. Throws on anything else. */
export function parseUsd(input: string): bigint {
  const m = USD_INPUT.exec(input.trim());
  if (!m) throw new Error(`Not a dollar amount: ${JSON.stringify(input)}`);
  const whole = BigInt(m[1].replaceAll(",", ""));
  const frac = BigInt((m[2] ?? "").padEnd(USDC_DECIMALS, "0"));
  return whole * SCALE + frac;
}

/** bigint isn't JSON-serializable: amounts cross API boundaries as decimal strings. */
export function toApiAmount(raw: bigint): string {
  return raw.toString();
}

export function fromApiAmount(s: string): bigint {
  if (!/^\d+$/.test(s)) throw new Error(`Invalid amount: ${JSON.stringify(s)}`);
  return BigInt(s);
}

/** "15" or "12.5" (%) → basis points (1500, 1250). 0–100%, at most 2 decimals. */
export function parsePercentToBps(input: string): number {
  const m = /^(\d{1,3})(?:\.(\d{1,2}))?%?$/.exec(input.trim());
  if (!m) throw new Error(`Not a percentage: ${JSON.stringify(input)}`);
  const bps = Number(m[1]) * 100 + Number((m[2] ?? "").padEnd(2, "0"));
  if (bps > 10_000) throw new Error("Percentage must be 100 or less");
  return bps;
}

export function formatBps(bps: number): string {
  if (bps % 100 === 0) return `${bps / 100}%`;
  return `${(bps / 100).toFixed(2).replace(/0$/, "")}%`; // 1250 → "12.5%", 1 → "0.01%"
}
