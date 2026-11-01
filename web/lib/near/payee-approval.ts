// Server-side check of a wallet-signed add_payee (never trust the client's word that it's done):
// the tx must contain a `payee_added` event, from the vault itself, on a SUCCESSFUL receipt,
// for exactly this payee account.
import { type TxOutcome, vaultEvents } from "./outcome";

export type ApprovalCheck = { ok: true; payableFromNs: bigint; capPerPayout: bigint; role: string } | { ok: false; reason: "not_found" | "wrong_payee" };

export function verifyPayeeAdded(tx: TxOutcome, vaultId: string, payeeAccount: string): ApprovalCheck {
  const added = vaultEvents(tx, vaultId).filter((e) => e.event === "payee_added");
  if (added.length === 0) return { ok: false, reason: "not_found" };
  const mine = added.find((e) => e.data.account_id === payeeAccount);
  if (!mine) return { ok: false, reason: "wrong_payee" };
  return {
    ok: true,
    payableFromNs: BigInt(String(mine.data.payable_from_ns)),
    capPerPayout: BigInt(String(mine.data.cap_per_payout)),
    role: String(mine.data.role),
  };
}
