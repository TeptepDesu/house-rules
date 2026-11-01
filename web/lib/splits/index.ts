// Pure split math (plan §6B). bigint raw USDC, zero dust:
//   cleaner = min(cleaning_fee, collected)
//   net     = collected - cleaner
//   manager = floor(net * mgmt_fee_bps / 10_000)
//   owner   = net - manager            (absorbs the rounding remainder)
//   invariant: cleaner + manager + owner == collected, all >= 0

export type Split = { cleaner: bigint; manager: bigint; owner: bigint };
export type Role = "owner" | "cleaner";
export type PayoutItem = { key: string; payee: string; amount: bigint };

const BPS = 10_000n;
const MAX_KEY_LEN = 64; // must match the vault (docs/vault-spec.md)

export function splitCollected(i: { collected: bigint; cleaningFee: bigint; mgmtFeeBps: number }): Split {
  if (i.collected < 0n) throw new Error("collected must be >= 0");
  if (i.cleaningFee < 0n) throw new Error("cleaningFee must be >= 0");
  if (!Number.isInteger(i.mgmtFeeBps) || i.mgmtFeeBps < 0 || i.mgmtFeeBps > 10_000) {
    throw new Error("mgmtFeeBps must be an integer between 0 and 10000");
  }
  const cleaner = i.cleaningFee < i.collected ? i.cleaningFee : i.collected;
  const net = i.collected - cleaner;
  const manager = (net * BigInt(i.mgmtFeeBps)) / BPS;
  return { cleaner, manager, owner: net - manager };
}

/**
 * Booking split including penalty invoices. Penalty proceeds go 100% to the owner unless the
 * invoice is marked as operator revenue, in which case they go to the manager share.
 */
export function splitBooking(i: {
  collected: bigint;
  cleaningFee: bigint;
  mgmtFeeBps: number;
  penalties?: { amount: bigint; operatorRevenue: boolean }[];
}): Split {
  const s = splitCollected(i);
  for (const p of i.penalties ?? []) {
    if (p.amount < 0n) throw new Error("penalty amount must be >= 0");
    if (p.operatorRevenue) s.manager += p.amount;
    else s.owner += p.amount;
  }
  return s;
}

/**
 * Vault payout items for one booking: one per paid role, keyed "<bookingId>:<role>" (the vault's
 * idempotency key). The manager share stays in the vault (retained), so it gets no item.
 * Zero amounts are skipped: the vault rejects them as InvalidItem.
 */
export function payoutItems(bookingId: string, split: Split, payees: Record<Role, string>): PayoutItem[] {
  const out: PayoutItem[] = [];
  for (const role of ["owner", "cleaner"] as const) {
    const amount = split[role];
    if (amount === 0n) continue;
    const key = `${bookingId}:${role}`;
    if (new TextEncoder().encode(key).length > MAX_KEY_LEN) {
      throw new Error(`payout key exceeds ${MAX_KEY_LEN} bytes: ${key}`);
    }
    out.push({ key, payee: payees[role], amount });
  }
  return out;
}
