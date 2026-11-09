# House Rules — NEAR Hackathon Plan (v3)

> **Your payouts run themselves. Your rules are enforced on-chain.**
> An autonomous back office for short-term rental operators: guests pay from any chain, a settlement agent reconciles and pays owners and cleaners, and a NEAR policy vault makes it impossible for the agent to pay anyone, or any amount, outside the operator's rules.

**Tracks (select all three in the form):**
- `realworld` (primary) — invoicing + payouts for a real business, stablecoins, Intents
- `security` — spending limits, policy engine, scoped function-call keys: "give AI money without the keys to everything"
- `business` — treasury, payouts, revenue sharing; "humans only set the constraints"

---

## 0. Ground rules

- **Build window (official FAQ, Q-001):** code is allowed from the announcement on 19 Oct 2026 through 14 Nov 23:59 UTC. Spike code from the prep days may be reused.
- **README must list** libraries, templates, and AI-generated code used (Q-005), and include a `LICENSE` file (MIT is fine, Q-014).
- **Demo post on X** must say it was built at NEAR HACKATHON and tag `@NEARProtocol` and `#NEARHackathon` (optionally `@NearLegion`, `@NearBuilders`). Lead with the user problem, show one complete action → result, and say concretely what NEAR enables.
- **Hosted demo** is a plus. Keep it up through 18 Nov, ideally 25 Nov (Q-012).
- **AI judges screen, humans decide** (Q-017): the README must make the project reproducible with "do X → see Y" steps.
- **NEAR AI credits:** $10 free by joining NEAR Builders (for the AI triage stretch).
- **Synthetic data only.** No third-party code, data or branding, and no design partner is named.
- **Pace:** the timeline assumes ~6 focused hours/day. If a day runs short, use the cut line in §7.

---

## 1. The product

Rental operators collect money from many places (Airbnb/Booking.com payouts, direct bookings, damage and penalty claims), reconcile in spreadsheets, then pay owners and cleaners by hand. Automating payouts is scary: whatever runs them can drain the account.

**House Rules:**
1. **Collect.** Guests pay direct bookings, extensions, and penalty invoices from any token on any chain via **NEAR Intents (1Click)**. Exact USDC lands in the operator's **House Rules Vault** on NEAR.
2. **Reconcile.** On-chain payments match automatically. OTA payout reports are dropped in, and the format is auto-detected. Underpayments and open damage claims block payout.
3. **Split & disburse — autonomously, within rules.** A settlement agent computes the 3-way split (flat cleaner fee, management fee %, owner net) and pays out through the vault. The agent holds only a **function-call key** that can call `settle()` and nothing else. The **vault contract** enforces the operator's rules on-chain: only allowlisted payees, per-payout caps, a daily limit, a new-payee delay, and each booking paid once.

**Why NEAR, in one line each:**
- **Intents:** guests pay from 30+ chains; the operator always receives exact USDC.
- **Access keys:** NEAR's native scoped keys make "an agent that can pay but can't steal" a protocol feature, not a custom wallet.
- **Contract-held policy + atomic batch payouts:** one receipt pays every owner and cleaner, or nobody.
- **Confidential Intents (stretch):** operator revenue doesn't have to sit on a public ledger.

**"Why would an Airbnb guest pay in USDC?"** They don't. On-chain inflow is for direct bookings and off-platform incidentals (damage, late checkout, extra guests). OTA bookings are reconciled from payout reports and paid out after the operator funds the vault (§6C).

---

## 2. Key technical facts (re-verify in docs during spikes)

| Fact | Implication |
|---|---|
| 1Click: unique single-use deposit address per quote + status endpoint; `EXACT_OUTPUT` delivers an exact amount to a recipient. | One quote per invoice payment; the deposit address is the match key. The recipient is the **vault contract**. |
| **No Intents testnet.** 1Click is mainnet-only. Origin minimums vary. | Demo inflow on mainnet with small amounts. E2E mocks 1Click. |
| 1Click JWT optional; without it, 0.2% fee. | Apply in prep; env var only. |
| **Function-call access keys can't transfer NEAR and can only call listed methods on one receiver.** They also can't attach deposits. | The agent key is scoped to `vault.settle`. It can't withdraw, add payees, or change limits. |
| `ft_transfer` requires exactly 1 yoctoNEAR attached. | The **vault attaches the 1 yocto from its own balance** when it pays. That's why a contract is needed: the agent's key calls `settle` with 0 deposit. |
| NEP-141 receivers must be storage-registered (NEP-145). | `add_payee` is payable and calls `storage_deposit` on the USDC contract for the payee. Payouts never fail on registration. |
| Multiple function-call actions to one receiver in one promise run in one receipt and revert together. Promises joined with `.and()` are separate receipts and do **not** roll each other back. | `settle` builds **one** `Promise::new(token)` and chains `.function_call("ft_transfer", …)` N times, then `.then(on_settled)`. Never `.and()`. |
| The vault itself must be storage-registered on the token before it can receive USDC (including 1Click deliveries). | `new()` is payable and calls `storage_deposit` for `env::current_account_id()`; deploy script attaches the deposit. |
| Per-transaction gas limit. | Max payouts per `settle` call measured in spike #1; the agent chunks larger runs. |
| JS contract SDK is alpha and not recommended for value-holding contracts; **Rust SDK is recommended**. | Vault in **Rust** (`near-sdk-rs` + `cargo-near`), tested with `near-workspaces`. Small surface, AI-assisted. |
| **Confidential Intents** is publicly available via a 1Click parameter; settlement into a confidential balance is possible. | Stretch "private revenue" mode, spiked on Oct 29. Not core: confidential balances live inside Intents, not in the vault. |

**Networks:** dev + E2E on testnet with a mock FT standing in for USDC; **demo on mainnet** with $3–10 invoices so the same USDC is collected, reconciled, and paid out on camera. `NEAR_NETWORK` env var switches contract IDs and RPC.

---

## 3. Architecture

```
Repo (monorepo)
├── contracts/vault/            Rust: House Rules Vault (near-sdk-rs)
│   └── tests/                  near-workspaces integration tests (sandbox)
└── web/                        Next.js App Router on Vercel
    ├── app/(dashboard)         Properties, payees, invoices, bookings, reconciliation, settlements, audit log
    ├── app/pay/[publicId]      Guest payment page (1Click)
    ├── app/api/invoices
    ├── app/api/pay/intents     Create quote, poll status
    ├── app/api/import          OTA payout report import (format auto-detect)
    ├── app/api/agent/run       Settlement agent run (cron + manual trigger)
    └── lib/
        ├── near/               near-api-js: vault calls, view calls, event parsing, RPC verification
        ├── intents/            1Click client
        ├── importers/          airbnb.ts, booking.ts, guesty.ts + header detection
        ├── reconcile/          Pure matching logic
        ├── splits/             Pure split math (bigint micro-USDC)
        ├── agent/              Plan → policy pre-check → chunk → settle → verify
        └── auth/               JWT + bcrypt

Postgres (PGlite locally, hosted Postgres in prod) + Drizzle · Tailwind + shadcn/ui · Vitest + fast-check · Playwright
```

**Who signs what**
| Action | Signer | Why |
|---|---|---|
| Deploy vault, add/remove payee, change limits, withdraw | Operator's wallet (full access, 1 yocto) | Policy changes always need a human |
| `settle(batch)` | Agent's function-call key (server env var) | Autonomous within policy; worst case bounded |
| Guest payment | Guest, from any chain via 1Click | No NEAR wallet needed |

### UI references (structure and patterns only, never branding, colors, or logos)

_Superseded 2026-11-06: the UI now follows the Airbnb app and the NEAR HACKATHON site. `design.md` is current; this table is kept as history._

| Screen | Reference | What to take |
|---|---|---|
| Home | Stripe Dashboard balance/payouts overview | Vault balance, collected this week, pending payouts, blocked bookings |
| Invoices & payments | Stripe payments list | Table with status pills, filters, one row per payment |
| Settlements / agent runs | Stripe payout detail | Planned vs. paid vs. rejected, with reasons |
| Audit log | Stripe Events & logs | On-chain event feed, each row links to the tx |
| Network switch | Stripe "Test mode" toggle + banner | Testnet/mainnet toggle with a visible banner |
| Guest pay page | Stripe hosted invoice page | Amount, what it's for, one big action; asset picker + QR + live status replaces the card form |
| Vault policy | Ramp spend controls | Rules as plain-language cards: "Pays only these 6 people", "Max $800 per payout", "Up to $3,000 per day", "New payees wait 24 hours" |

**Design rule: fintech, not crypto.**
- No neon, gradients, or wallet-address soup on main screens.
- Show names ("Maria – cleaner") with the NEAR account in small text.
- Show dollar amounts; mention USDC only where it matters.
- Keep tx hashes behind a "view on-chain" link.
- shadcn defaults, neutral palette, one accent color.

The track asks for something a normal company could use tomorrow, and judges decide that in the first five seconds of the demo.

---

## 4. House Rules Vault (contract spec)

One vault per operator, deployed as a sub-account (e.g. `vault.operator.near`).

**State**
```
owner: AccountId                      // operator
agent: AccountId                      // account holding the scoped function-call key
token: AccountId                      // USDC contract
payees: Map<AccountId, Payee>         // { role: owner|cleaner, cap_per_payout, added_at_ns, active }
daily_limit: u128                     // raw USDC
spent_window: { day_start_ns, spent } // rolling 24h
payee_delay_ns: u64                   // new payees payable only after this delay (demo: minutes)
paid_keys: Set<String>                // "booking_id:role" — on-chain idempotency
```

**Methods**
```
new(owner, agent, token, daily_limit, payee_delay_ns)   payable: registers the vault itself on token
add_payee(account, role, cap)       owner, payable: covers storage_deposit on token
remove_payee(account)               owner, 1 yocto
set_limits(daily_limit, delay)      owner, 1 yocto
set_agent(account)                  owner, 1 yocto
settle(items: [{key, payee, amount}])   owner or agent, 0 deposit
    checks: payee active + past delay, amount ≤ cap, key unused,
            sum ≤ remaining daily limit, items ≤ MAX_BATCH
    effects: mark keys, add to spent, emit `settle_started`
    then: ONE Promise::new(token) with N chained ft_transfer actions (1 yocto each, memo=key)
          .then(on_settled(items))
    gas: starting estimates ~10 TGas per ft_transfer + ~15 TGas reserved for on_settled;
         real MAX_BATCH comes from spike #1 measurements, not these numbers
on_settled(items)                   private callback
    success → emit `settled`
    failure → unmark keys, restore spent, emit `settle_failed`
withdraw(amount, to)                owner, 1 yocto
views: get_policy, get_payees, is_paid(key), remaining_today
```

**Events (NEP-297 `EVENT_JSON` logs):** `payee_added`, `payee_removed`, `limits_changed`, `settle_started`, `settled`, `settle_failed`. The dashboard's audit log reads these, so the accountant's trail is on-chain, not just in our DB.

**Policy violations panic** with a stable, parseable reason: `POLICY_REJECTED:<Code>` where Code ∈ `PayeeNotAllowed`, `PayeeInDelay`, `OverCap`, `DailyLimitExceeded`, `AlreadyPaid`, `BatchTooLarge`, `Unauthorized`. No state changes, and the failed transaction stays visible on-chain with its reason. There's no `policy_rejected` event: a panicking call can't emit a reliable success event. The dashboard reads rejections from failed tx outcomes. near-workspaces tests assert `is_failure()` + the code. The demo triggers several on purpose.

---

## 5. Data model

```
users            id, email, password_hash, name, operator_account, vault_account, agent_account, created_at
properties       id, user_id, name, owner_payee_id, cleaner_payee_id,
                 cleaning_fee_raw, mgmt_fee_bps
payees           id, user_id, name, role ('owner'|'cleaner'), near_account,
                 cap_raw, vault_status ('pending_signature'|'in_delay'|'active'|'removed'), added_tx
bookings         id, user_id, property_id, external_ref, channel ('direct'|'airbnb'|'booking_com'|'other'),
                 collection_mode ('onchain'|'ota_payout'), guest_name, check_in, check_out,
                 expected_gross_raw, ota_payout_raw?, cleaning_fee_override_raw?,
                 settlement_status ('unreconciled'|'blocked'|'ready'|'settling'|'settled'), source, imported_at
invoices         id, user_id, booking_id?, public_id (≥128-bit random),
                 type ('booking'|'extension'|'penalty'|'deposit'), amount_raw,
                 status ('open'|'pending'|'paid'|'underpaid'|'overpaid'|'expired'|'refunded'|'waived'),
                 due_date, created_at, paid_at
payments         id, invoice_id, deposit_address UNIQUE, origin_asset, amount_received_raw,
                 status, origin_tx, destination_tx UNIQUE, raw_status_json, verified_at
reconciliation   id, booking_id, result ('matched'|'mismatch'|'open_penalty'|'unpaid'|'orphan_payment'),
                 delta_raw, note, run_at
agent_runs       id, user_id, trigger ('cron'|'manual'), status, planned_total_raw, paid_total_raw,
                 rejected_count, started_at, finished_at
settlement_txs   id, agent_run_id, chunk_index, tx_hash UNIQUE, status, executed_at
payout_splits    id, booking_id, role ('owner'|'cleaner'|'manager'), payee_id?, amount_raw,
                 vault_key ("booking_id:role"), settlement_tx_id?, status ('pending'|'paid'|'retained'|'rejected')
                 UNIQUE (booking_id, role)
activity_log     id, user_id, action, entity, entity_id, meta_json, created_at
```

The manager's share is `retained` (stays in the vault, withdrawn by the operator).

---

## 6. Logic

### A. Reconciliation (`lib/reconcile`, pure)
Evaluated in order:
1. `open_penalty` — unpaid, non-waived penalty invoice → `blocked`
2. `mismatch` — collected ≠ expected (on-chain: sum of paid invoices; OTA: payout vs. expected net) → `blocked`, store delta
3. `unpaid` — on-chain booking past due with nothing collected → `blocked`
4. `matched` → `ready`
5. `orphan_payment` — verified payment with no booking (listed separately)

### B. Split math (`lib/splits`, bigint, zero dust)
```
cleaner = min(cleaning_fee, collected)
net     = collected - cleaner
mgmt    = net * mgmt_fee_bps / 10_000n     // floors
owner   = net - mgmt                       // absorbs remainder
invariant: cleaner + mgmt + owner == collected, all >= 0
```
Penalty proceeds go 100% to the owner unless the invoice is marked as operator revenue.

### C. OTA bookings
OTA payouts arrive off-chain. They're reconciled from the payout report, and their splits are computed. Before paying them, the agent checks the vault balance and asks the operator to top up if it's short, instead of failing mid-run.

### D. Smart import (`lib/importers`)
Drag-and-drop file → detect Airbnb / Booking.com / Guesty-style export from headers → map to bookings → **preview** ("22 will match, 2 flagged, 1 duplicate") → confirm. Synthetic fixture file per format, each with a unit test. Unknown format → manual column-mapping fallback.

### E. Settlement agent (`lib/agent`)
1. Run reconciliation; collect `ready` bookings; compute splits.
2. **Off-chain policy pre-check** mirroring the vault rules: payee active and past delay, cap, remaining daily limit, balance. Anything failing stays `pending` with a reason. It's never sent.
3. Chunk to `MAX_BATCH`; call `vault.settle` with the function-call key.
4. Verify `settled` events on-chain; mark splits `paid`, bookings `settled`.
5. Record the run (planned vs. paid vs. rejected) for the dashboard.

Triggers: a **Run agent now** button (primary), plus a scheduled GitHub Actions workflow that calls `/api/agent/run` with a secret header. Vercel's free plan only runs cron jobs once a day. The endpoint rejects calls without the secret or a logged-in operator session.

**Design rule: the agent is deterministic.** Amounts, payees, and decisions come from pure functions and on-chain policy. An LLM (stretch) only explains exceptions and drafts guest messages. It never decides who gets paid or how much. Put this in the README; it's a deliberate security choice.

---

## 7. Scope

**Core (done Nov 3; see §9)**
1. Vault contract + near-workspaces tests
2. Operator auth, properties, payees (wallet-signed `add_payee`)
3. Invoices + guest pay page + 1Click inflow → vault
4. Reconciliation + smart import (3 formats + fallback)
5. Split engine + fast-check invariants
6. Settlement agent (pre-check, chunk, settle, verify) + Run-now button
7. Dashboard: metric cards, settlements view, **on-chain audit log from vault events**
8. Playwright E2E full loop + README

**Cut line if behind (in this order):** manual column mapping → Guesty importer → cron trigger (keep the button) → payee delay → dashboard charts.

**Stretch (outcomes in §9)**
1. **Private revenue mode:** guest payments settle via Confidential Intents into the operator's confidential balance; the operator tops up the vault per settlement run. Only if spike #2 shows it's one parameter + simple withdrawal.
2. **AI exception triage via NEAR AI Cloud** (private inference, so guest data isn't sent to a public LLM): explains each blocked booking and drafts the follow-up with a penalty pay link. **Built Nov 3; the live NEAR AI call is not yet verified.**
3. Cross-chain owner payouts (owner receives USDC on another chain).

**Dropped:** direct NEAR-wallet guest payments (Rail A), gasless meta transactions, OTA API integrations, fiat ramps.

---

## 8. Testing & security

**Contract (Rust unit + near-workspaces sandbox, mock FT)**
- Agent can `settle` to allowlisted payees within limits → balances move, `settled` event
- Each rejection: unknown payee, in delay, over cap, over daily limit, duplicate key, batch too large, unauthorized caller
- Agent key **cannot** call `withdraw` / `add_payee` / `set_limits` (key-scope test)
- One failing transfer in a batch → whole batch reverts, keys unmarked, daily spend restored
- Daily window rolls over correctly
- `add_payee` registers storage on the token

**App (Vitest + fast-check)**
- Split invariant over random inputs (0%, 100% fee, fee > collected, 1 micro-USDC, huge values)
- Reconciliation branches + evaluation order; importer fixtures per format; duplicates
- Agent pre-check mirrors contract rules (same cases as the contract tests, so drift is caught)
- Chunking: no split lost or duplicated
- 1Click status mapping (PENDING, SUCCESS, REFUNDED, expired)

**E2E (Playwright, testnet + mocked 1Click)**
- Create property + payees → invoice → guest pays (mock) → reconcile → agent run → owner/cleaner balances up → audit log shows events
- Underpayment and open penalty block payout
- Over-cap payout is rejected and shown with its reason
- RBAC: operator B can't see operator A's data

**Threat model (README)**
| Threat | Mitigation |
|---|---|
| Agent key leaked | Key can only call `settle`; contract pays only allowlisted payees within caps and daily limit. Worst case = paying legitimate payees early, bounded per day |
| Server/DB compromised, attacker adds own payee | Adding payees needs the operator's wallet signature; new payees sit in a delay window; `payee_added` events are visible in the audit log |
| Double payout | On-chain `paid_keys` + `UNIQUE (booking_id, role)` in DB |
| Fake "paid" invoice | Server verifies 1Click status + destination tx on-chain |
| Partial batch failure | Atomic batch; callback restores state |
| Payee not storage-registered | Registered at `add_payee` time |
| Guessable invoice URLs | ≥128-bit random `public_id` |
| Leaked secrets | Env vars only; no full-access key ever on the server |
| Anyone triggers agent runs | `/api/agent/run` requires an operator session or the scheduler's secret header; runs are idempotent anyway |

---

## 9. Timeline

### Prep — Oct 27–31 (spikes in `near-spikes/` only)
| Date | Do | Done when |
|---|---|---|
| **Tue Oct 27** | Discord question. Install Rust, `cargo-near`, `near-cli-rs`. Create testnet accounts: `operator`, `agent`, `owner-1`, `cleaner-1`. Read access-key, NEP-141/145, 1Click docs. | Toolchain builds a hello contract |
| **Wed Oct 28** | **Spike #1 (hardest unknown):** Rust contract that registers itself on a mock FT, holds tokens, and pays N accounts via **one** `Promise::new(token)` with chained `ft_transfer`s + `#[private]` callback. near-workspaces tests: (a) all succeed, (b) one unregistered recipient → whole batch reverts and callback restores state, (c) a panic with `POLICY_REJECTED:OverCap` is readable from the failed outcome. **Measure gas per transfer → `MAX_BATCH`.** | Atomic batch + callback + rejection parsing proven; `MAX_BATCH` known |
| **Thu Oct 29** | **Spike #2:** 1Click tokens → `EXACT_OUTPUT` quote → one small real mainnet payment to a contract account → status `SUCCESS`. Request one quote with the confidentiality option and note what it needs. Apply for JWT. | Real payment observed; confidential mode go/no-go noted |
| **Fri Oct 30** | **Spike #3:** add a function-call key on `agent` scoped to the spike contract's `settle`; call it from Node with near-api-js; confirm calls to other methods fail. Check what NEAR AI Cloud's API looks like (for stretch). | Key scoping proven from JS |
| **Sat Oct 31** | Write `docs/`: vault interface spec (§4 refined), schema, edge-case table, wireframes, 3 synthetic payout reports, demo script, `.env.example`. | Day-1 checklist complete |

### Build — Nov 1–14 (revised 2026-11-03)

**Why it changed:** the whole core scope (§7, items 1–8) was done on Nov 3, a week early, along with the testnet proof (agent payouts, real-wallet payee approval, `break-it`) and stretch 2 (follow-up messages). On Nov 5 Claude finished everything that doesn't need Joseph: the enhancement backlog below is done or decided. **Every remaining step is Joseph's, or needs his OK** (`docs/needs-from-joseph.md`). The dates below replace the first revision, whose hosting and mainnet days (Nov 4–6) passed without those steps.

**Done, Nov 1–5:** monorepo, auth, vault contract + unit/sandbox tests, testnet deploy, properties/payees, invoices + pay page, 1Click inflow (mock), import + reconciliation, splits + fast-check, agent + Run-now, dashboard + audit log, Playwright suite, README walkthrough, follow-up messages, dark theme, weekly chart, mainnet preflight, mainnet runbook, submission draft, production smoke test on a real Postgres connection.

| Date | Do | Who | Exit criteria |
|---|---|---|---|
| **By Nov 8** | Push. Fund the mainnet account and the Base wallet | Joseph | Funds in the wallets |
| **By Nov 9** | Hosted Postgres + Vercel, `db:migrate` (`0000`–`0006`), smoke-test sign-in | Joseph, Claude runs the migrate | Hosted app signs in |
| **By Nov 11** | **Required.** `docs/mainnet-runbook.md`: deploy, payees, first real $1 payment, full loop. Fix what it turns up | Joseph signs, Claude supports | Demo path works end to end on mainnet |
| **Nov 12** | **Code freeze.** Fixes only. Full suites, agentshield, dry run of `docs/demo-script.md` | Claude, Joseph for the dry run | Everything green; script runs clean |
| **Nov 13** | Rehearsal $1 payment about an hour before recording, record the demo, publish the X post | Joseph | Video and post live |
| **Nov 14** | Repo public, then submit with `realworld` + `security` + `business`. **Aim for 12:00 UTC.** Hard deadline 23:59 UTC | Joseph approves, Claude sends | Submitted |

**Mainnet is required (Joseph, 2026-11-09).** The rules would accept testnet (`HACKATHON.md`, Q-010), but the submission must show the full loop on mainnet: a real guest payment through 1Click into the vault, then the agent's payout. 1Click has no testnet (Q-007), so only mainnet proves it. The demo is recorded on mainnet.

**If time runs short:** the Nov 14 row, the video, and the mainnet loop (Nov 11 row) are required. Only hosting can be cut (Q-012).

**Enhancement backlog: outcome, Nov 5**
1. **NEAR AI rewording live:** waiting on a cloud.near.ai key (optional). The feature stays off without one.
2. **Polish pass: done.** Dark theme with light toggle, axe clean in both themes, own 404 and error pages, icon, starter assets removed. A run the pre-check held entirely now reads **Held back**, not Failed. Agentshield went from C (74) to A (98).
3. **Overview charts: done.** Collected by week, with a table view and keyboard tooltips.
4. **Stretch 1, private revenue mode: dropped.** 1Click answers 401 without user authentication, so it isn't one parameter (`docs/notes.md`).
5. **Stretch 3, cross-chain owner payouts: dropped.** It needs a vault contract change after the testnet proof and before mainnet has run. Not worth the risk to the core demo.

---

## 10. Day-1 checklist

- [ ] Private GitHub repo with MIT `LICENSE`
- [ ] Postgres (any standard PostgreSQL 13+) for production + Vercel project. Local dev needs nothing: PGlite
- [ ] Testnet + mainnet accounts; keys in a password manager, never in the repo
- [ ] Mainnet: a few NEAR (vault deploy storage + gas + payee storage deposits) + ~$30 USDC for demo
- [ ] 1Click JWT (or accept 0.2%)
- [ ] `docs/` complete: vault spec, schema, edge cases, wireframes, fixtures, demo script
- [ ] Spike learnings in `docs/notes.md` (prose, not code)

---

## 11. Demo script (2 minutes, mainnet)

1. **Hook (10s):** "Rental operators reconcile in spreadsheets and pay owners by hand, because automating payouts means trusting software with the bank account. House Rules makes that safe."
2. **Collect (20s):** Guest pays a damage invoice from another chain through NEAR Intents. Exact USDC lands in the vault.
3. **Reconcile (15s):** Drop an Airbnb payout report: format detected, 22 matched, one underpaid, one blocked by an open damage claim.
4. **Autonomous payout (25s):** Click **Run agent**. Splits computed (cleaner flat fee, 15% management, owner net), owners and cleaners paid in one atomic batch, audit log fills from on-chain events.
5. **Try to break it (30s) — the key moment:** use the agent's key to (a) pay an unknown account, (b) pay over the cap, (c) pay a booking twice. The contract rejects all three on-chain. Then show that the agent key can't even call `withdraw`.
6. **Close (20s):** "Humans set the rules. NEAR enforces them." Flash the green contract + Playwright suites and the threat model.

---

## 12. Open questions (resolve in prep)

- [x] Pre-hackathon work: allowed from the Oct 19 announcement (`HACKATHON.md`, Q-001). No Discord question needed
- [x] `MAX_BATCH` (spike #1): **40** at 5 TGas/transfer with 300 TGas prepaid; protocol hard cap is 100 actions/receipt. Revisit with real testnet USDC gas. See `docs/notes.md`
- [x] Mainnet USDC contract ID (`docs/notes.md`); mock FT for testnet/sandbox
- [x] 1Click origin routes: USDC on Base, about $1.01 for $1. Confidentiality needs user authentication (`docs/notes.md`)
- [x] Scheduling: free-plan Vercel cron runs once a day, so use the Run-now button + GitHub Actions schedule
- [x] NEAR AI Cloud API shape and access (stretch): OpenAI-compatible, `https://cloud-api.near.ai/v1`, `sk-` keys from cloud.near.ai. See `docs/notes.md`
