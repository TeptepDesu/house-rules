# House Rules

**Your payout rules, enforced on-chain.**

House Rules is an autonomous back office for short-term rental operators:
- **Collect:** guests pay invoices from any chain via NEAR Intents.
- **Reconcile:** the app matches every booking against what was actually collected.
- **Pay out:** a settlement agent pays owners and cleaners from a NEAR vault that makes it impossible to pay anyone, or any amount, outside the operator's rules.

Built at **NEAR HACKATHON** (Oct 19 – Nov 14, 2026). Tracks: `realworld` · `security` · `business`.

---

## The problem

A rental operator collects money from Airbnb and Booking.com payouts, direct bookings and damage claims. They reconcile it in spreadsheets, then pay each property owner and cleaner by hand.

Automating that last step is scary: whatever runs the payouts can drain the account. So operators don't automate it.

## The idea

Give the automation a key that **can pay, but can't steal**.

1. **Vault:** the operator's USDC sits in a small NEAR contract. Only the operator's wallet can change its rules:
   - who may be paid;
   - the most per payout;
   - a daily limit;
   - a waiting period for new payees.
2. **Agent:** reconciles bookings, computes each split (cleaner's flat fee, management %, owner gets the rest) and pays through the vault.
   - It holds a NEAR **function-call key** that can only call `vault.settle`.
   - It can't withdraw, add payees or change limits, and the protocol enforces that, not our code.
3. **Every payout batch is atomic.** One receipt pays every owner and cleaner in the batch, or nobody.
4. **Every rule violation is refused on-chain** with a readable reason (`POLICY_REJECTED:OverCap`, …), and shows up in the app.

> **Humans set the rules. NEAR enforces them.**

### What NEAR enables here

| NEAR feature | What it gives the operator |
|---|---|
| **Function-call access keys** | An agent that can pay but can't steal. The key is scoped by the protocol to one contract and one method, and can't attach deposits. |
| **One receipt, many actions** | A batch of `ft_transfer`s in one promise succeeds or reverts together, so payouts are never half-done. |
| **Contract-held policy** | Allowlist, caps, daily limit, payee delay and pay-once keys live in the vault, not in a database a hacker could edit. |
| **NEAR Intents (1Click)** | Guests pay from 30+ chains; the vault always receives exact USDC (`EXACT_OUTPUT`). |

---

## Try it in 5 minutes (no wallet, no chain, no setup)

By default the app runs in **rehearsal mode**:
- **Database:** an in-process Postgres (PGlite).
- **Guest payments:** a simulated 1Click.
- **Vault:** a simulated vault that applies the same rules.

Every screen is labelled. The real on-chain path is covered by the tests in [Proof on a real chain](#proof-on-a-real-chain).

**Prerequisites:** Node 22+ (tested on 25.9) and pnpm 12.

```bash
pnpm install
pnpm --filter web dev        # http://localhost:3000
```

| Do this | You should see |
|---|---|
| **1.** Open `/signup` and create an account | **Overview** with a 3-step setup checklist, 0 of 3 done. The amber bar says *Test mode · NEAR testnet* |
| **2.** **People & properties** → add *Owen* (Property owner, `owen.testnet`, max $800) and *Maria* (Cleaner, `maria.testnet`, max $100) | Both listed by **name first**, account in small text, *Needs signature*. Try `guy.near`: it's refused because this is testnet |
| **3.** Add properties **Casa Azul**, **Loft 21**, **Seaside Cottage**: owner Owen, cleaner Maria, cleaning fee 80, management 15 | Three rows with $80.00 and 15% |
| **4.** **Import** → drop [`web/test/fixtures/payout-reports/airbnb-style.csv`](web/test/fixtures/payout-reports/airbnb-style.csv) | *Airbnb payout report* detected: **"22 will match, 2 flagged, 1 duplicate"**. The flags say *Not in USD* and *Listing doesn't match any of your properties* |
| **5.** Click **Import 22 bookings** → **Review bookings** | 21 *Matched*, and **1 blocked**: *Collected $474.70 vs expected $494.70 ($20.00 short)*. Importing the same file again changes nothing |
| **6.** **Settings** → vault account `vault.yourname.testnet` | *Saved. Guests can now pay invoices online.* |
| **7.** **Invoices** → charge *Diego Santos · Casa Azul* $200, "Damage: broken lamp" | An open invoice. On **Bookings**, Diego's stay is now *Open damage claim*, so his payout is held |
| **8.** Click **Open** on the invoice (the guest's pay page) → pick *USDC on Arbitrum*, enter any refund address → **Get payment address** | A hosted-invoice page: *Send exactly 201 USDC on Arbitrum… (your name) receives exactly $200.00*, with a QR code and *Waiting for payment* |
| **9.** Click **Dev only: simulate the guest's deposit** | *Payment received*. The invoice is *Paid* and Diego's booking is unblocked |
| **10.** **Payouts** → **Run agent now** | **Paid $9,917.37 to 40 payees in 1 transaction. 2 payouts held back.** The $200 damage payment went to Diego's owner, pushing that payout to **$816.85, above Owen's $800 cap**: *Above this payee's per-payout limit*. Maria's $60.00 is held with the rest of the booking, which is never half-paid. The $20-short booking isn't paid either. Raising a cap needs the operator's wallet, not the agent |
| **11.** **Vault rules** | *Pays only these 2 people · At most $800.00 per payout · Up to $3,000.00 per day · New payees wait 24 hours · Each booking is paid once · The agent can only call settle* |
| **12.** **Audit log** | *Payout batch sent: 40 payouts, $9,917.37* → *Paid $9,917.37 in 40 payouts* (simulated in rehearsal; *On-chain* with a link when live), plus every in-app action |

This whole walkthrough is a browser test, [`web/e2e/readme.spec.ts`](web/e2e/readme.spec.ts), which asserts what each step says you'll see. If the README and the app ever disagree, that test fails.

---

## Proof on a real chain

The rehearsal mode only stands in for the network. The contract and the live agent path are tested against a **local NEAR sandbox** (nearcore) running the real vault wasm and a NEP-141 token.

**Prerequisites:** Rust (rustup) and `cargo-near`.

```bash
cd contracts
cargo test -p vault --lib                                # 32 unit tests: every rule, boundaries, check order, callbacks
cargo test -p vault --test sandbox -- --test-threads=4   # 8 tests on a sandbox with real token transfers
(cd vault && cargo near build non-reproducible-wasm) && (cd mock-ft && cargo near build non-reproducible-wasm)

cd ../web
pnpm test:integration     # 5 tests: the app's real agent code against that vault
```

**`pnpm test:integration` shows:**
- **One run pays every owner and cleaner in a single atomic `settle`**, signed with a key that can only call `settle`. On-chain balances match to the cent, and the management fee stays in the vault.
- **Running again sends nothing.**
- **The app refuses to run if the agent's key has full access.** It checks the key's permission on-chain before the first payout.
- **A payout over a payee's cap is held back** with a reason and never sent.
- **The Vault rules page reads policy and payees from the chain,** and syncs payee statuses.
- **Audit-log rows come from the vault's own events** in that transaction.

**The contract's sandbox tests also show:**
- **One failing transfer reverts the whole batch.** The first transfer, which had already run, is undone; the callback restores paid keys and the daily spend.
- **A function-call key can't call `withdraw`, `add_payee`, `set_limits` or `set_agent`.**
- **Callbacks are private.**
- **40 payouts fit comfortably in one transaction** (≈89 TGas).

---

## Architecture

```
guest (any chain) ──1Click EXACT_OUTPUT──▶ USDC ──▶ ┌────────────────────────────┐
                                                     │ House Rules Vault (NEAR)   │
operator wallet ── add_payee / limits / withdraw ──▶ │ allowlist · caps · daily   │──ft_transfer×N──▶ owners, cleaners
                                                     │ limit · payee delay ·      │   (one receipt)
agent (function-call key: settle only) ─ settle ───▶ │ paid keys · events         │
                                                     └────────────────────────────┘
Next.js app (Vercel): import → reconcile → split → pre-check → chunk → settle → verify → audit
Postgres (PGlite locally, any hosted Postgres in production) · Drizzle
```

| Path | What |
|---|---|
| [`contracts/vault`](contracts/vault/src/lib.rs) | The vault (Rust, near-sdk 5.29). Spec: [`docs/vault-spec.md`](docs/vault-spec.md) |
| [`contracts/mock-ft`](contracts/mock-ft/src/lib.rs) | NEP-141/145 test token (unrestricted mint; test-only) |
| [`web/lib/splits`](web/lib/splits/index.ts) | Split math in bigint micro-USDC. Property-tested: parts always sum exactly to what was collected |
| [`web/lib/reconcile`](web/lib/reconcile/index.ts) | open damage claim → mismatch → unpaid → matched |
| [`web/lib/importers`](web/lib/importers/index.ts) | CSV parser and header-based format detection (Airbnb / Booking.com / Guesty-style, or manual mapping) |
| [`web/lib/agent`](web/lib/agent) | `plan.ts` (pure), `precheck.ts` (mirrors the vault's rules case for case), `run.ts` (vault passed in) |
| [`web/lib/near`](web/lib/near) | Vault client, the agent-key scope check, and outcome/event/error parsing from raw RPC |
| [`web/lib/intents`](web/lib/intents) | 1Click client, status mapping, and on-chain proof of delivery |

**The agent is deterministic.** Amounts and payees come from pure functions and on-chain policy. No language model decides who gets paid or how much.

---

## Threat model

| Threat | Mitigation |
|---|---|
| The agent's key leaks | It's a function-call key that can only call `vault.settle`, with no deposits. The vault pays only allowlisted payees, within caps and the daily limit. Worst case: legitimate payees are paid early, bounded per day |
| Someone configures the server with a powerful key | The app checks the key on-chain before paying and **refuses to run** unless it's scoped to `vault.settle` only |
| The server or DB is compromised and an attacker adds their own payee | Adding a payee needs the operator's wallet. New payees wait out a delay, and `payee_added` events show in the audit log |
| Double payout | The vault's on-chain paid keys (`booking:role`), plus `UNIQUE(booking_id, role)` in the DB. Re-runs and crashes are idempotent |
| Partial batch failure | One receipt for all transfers. The callback restores keys and the daily spend. Callers check the result: a failed batch doesn't fail the transaction |
| A guest claims an invoice is paid | Payment status never comes from the browser. The server asks 1Click, then confirms the USDC actually reached the vault (NEP-141 events on *successful* receipts only) |
| A reverted transfer still carries its logs | Events are read only from successful receipts executed by the vault (or the token) itself |
| Guessable pay links | 128-bit random public ids. Each deposit address is bound to its invoice |
| One operator sees another's data | Every query is scoped to the signed-in operator, which E2E tests check |
| Leaked secrets | Env vars only, server-only modules, no full-access key on the server, and the repo denies reading `.env*` |

---

## Tests

| Suite | Command | Count |
|---|---|---|
| Contract: unit | `cd contracts && cargo test -p vault --lib` | 32 |
| Contract: sandbox | `cd contracts && cargo test -p vault --test sandbox` | 8 |
| App: unit, property and DB | `pnpm --filter web test` | 312 |
| App: browser (Playwright) | `pnpm --filter web e2e` (first time: `pnpm --filter web exec playwright install chromium`) | 14, plus 1 optional screenshot capture |
| App on a real vault | `pnpm --filter web test:integration` | 5 |

Also: `pnpm --filter web typecheck`, `pnpm --filter web lint`, `cargo clippy -p vault --target wasm32-unknown-unknown -- -D warnings`.

---

## Status (honest)

| | |
|---|---|
| ✅ Done and tested | Vault contract; import and reconciliation; splits; settlement agent; guest pay flow; every screen; audit log |
| ✅ Testnet | Vault + mock USDC deployed, payees approved, settle-only agent key. A real atomic payout and 5 policy refusals were verified on testnet; accounts and tx hashes are in [`docs/testnet-deployment.md`](docs/testnet-deployment.md) |
| ⏳ Before submission | The app's agent running **live** against the testnet vault (`pnpm --filter web test:testnet`), then mainnet |
| ⏳ Before submission | **A real 1Click payment** on mainnet (the client is checked against the API docs; live delivery is unproven so far) |
| ⏳ Before submission | **Wallet signing** for "approve payee" (`add_payee`). Until then the operator signs it with near-cli |
| Stretch | Confidential Intents for private revenue; AI exception triage on NEAR AI Cloud (private inference) |

Spike notes and measured numbers: [`docs/notes.md`](docs/notes.md). Design system: [`design.md`](design.md).

---

## Built with

**App:**
- **Framework and UI:** Next.js 16.4 (App Router), React 19.3, TypeScript 5.9, Tailwind CSS 4, shadcn/ui (base-nova style on Base UI), `cn`, class-variance-authority, tw-animate-css, lucide-react, IBM Plex Sans and Mono.
- **Data and auth:** Drizzle ORM and drizzle-kit, PGlite (local Postgres), node-postgres (`pg`), jose (sessions), bcryptjs, zod.
- **NEAR:** near-api-js 7.4.
- **Other:** qrcode.
- **Tests:** Vitest, fast-check, Playwright.

**Contract:**
- **Contract crates:** near-sdk 5.29.1, near-contract-standards 5.29.1.
- **Test crates:** near-sandbox 0.3.16, near-api 0.8.7, cargo-near-build 0.11.5, tokio, testresult.
- **Tooling:** cargo-near 0.22.

**Services:**
- **NEAR Intents 1Click API** (mocked in development and tests).
- **NEAR RPC.**

**Templates:**
- `create-next-app` (App Router + Tailwind).
- `cargo near new`. Its sample auction contract was replaced entirely; its sandbox test layout was kept.
- shadcn/ui component sources (`web/components/ui/`).

**AI-generated code:** most of this repository's code, tests and docs were written with **Claude (Anthropic) via Claude Code**, under the author's direction, review and decisions (scope, rules, product and design). Every line runs through the test suites above.

**Data:** all bookings, guests and payout reports are synthetic. No real customer data is used.

## License

[MIT](LICENSE) © 2026 Joseph Caballero
