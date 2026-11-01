# Spike notes

## Spike #1 — atomic batch payout (2026-11-01)

Code: `near-spikes/batch-payout/` (`mock-ft` = NEP-141/145 token built on near-contract-standards 5.29.1; `payer` = minimal vault). Run with `cargo test -p payer --test spike -- --nocapture --test-threads=1`. Sandbox via near-sandbox 0.3.16, so these are sandbox numbers on the nearcore version that crate ships, not testnet or mainnet.

### What was proven

- **One `Promise::new(token)` with N chained `ft_transfer` actions is atomic.** With the unregistered receiver in the middle of three, the first transfer, which had already executed, was rolled back. All balances ended where they started.
- **The `#[private]` callback sees the batch failure and restores state.** `env::promise_result_checked(0, 64)` returns `Err` when any action in the batch failed. The callback unmarked the paid keys, restored `spent` and emitted `settle_failed`. On success it returns `Ok` with an empty payload, because `ft_transfer` returns nothing.
- **The vault pays the 1 yocto per transfer from its own balance.** The agent called `settle` with 0 deposit, and the token's `assert_one_yocto` passed on every action.
- **The payable `init` can register the vault on the token.** It uses a detached `storage_deposit` promise, and `storage_balance_of(vault)` is set right after deploy.
- **`POLICY_REJECTED:<Code>` can be read from the failed transaction.** The error contains `Smart contract panicked: POLICY_REJECTED:OverCap`. Parse it with `/POLICY_REJECTED:([A-Za-z]+)/`. The rejected call changed no state.

### Things that would have bitten us

1. **A failed batch does not fail the transaction.** The final status is `SuccessValue(false)`, which is the callback's return value. The agent must not treat "tx succeeded" as "paid". It has to read the callback's return value or look for the `settled` event. `lib/agent` verification depends on this.
2. **Failed receipts still carry logs.** The reverted token receipt still contained the `nep141 ft_transfer` event from the first transfer, even though that transfer was undone. The audit-log parser must only take events from receipts whose status is success. The vault's own `settled` event is the source of truth, not the token's events.
3. **Self-registration in `init` is fire-and-forget.** If `storage_deposit` fails (for example, the deposit is too small), `init` still succeeds and the vault is unregistered. 1Click deliveries would then fail. The real vault needs either a callback that panics or logs on failure, or a deploy-script check of `storage_balance_of(vault)`. The dashboard should show it too.

### Gas

Measured with the mock token (near-contract-standards `ft_transfer`):

| n transfers | settle receipt | token receipt | per transfer | callback | total burnt |
|---|---|---|---|---|---|
| 1 | 2.37 TGas | 1.70 | 1.70 | 1.38 | 6.43 |
| 5 | 4.42 | 7.92 | 1.58 | 1.42 | 14.75 |
| 10 | 6.99 | 15.69 | 1.57 | 1.46 | 25.15 |
| 20 | 12.10 | 31.29 | 1.56 | 1.56 | 45.98 |

- **Per transfer:** about 1.57 TGas burnt. `settle` itself grows by about 0.5 TGas per item (JSON parsing and one storage write per key). The callback stays near 1.5 TGas, well under its 15 TGas reservation.
- **Gas attached per transfer:** even 1 TGas succeeded on the mock token. Don't rely on that, because the real USDC contract will cost more and we haven't measured it.
- **Largest batch that succeeds:**

  | Prepaid gas | Per-transfer attachment | Max batch |
  |---|---|---|
  | 300 TGas | 5 TGas | 44 |
  | 300 TGas | 3 TGas | 65 |
  | 1000 TGas | 3 or 5 TGas | 100 |

- **Gas ceiling:** the sandbox accepts up to **1000 TGas prepaid per transaction**; 1001 is rejected as `InvalidTransaction`. near-api's `max_gas()` is also 1000 TGas. Plan §2 assumed 300; re-check the ceiling on testnet.
- **Hard protocol cap: 100 actions per receipt.** 101 transfers fail with `ActionsNumberExceeded { limit: 100 }`, inside `settle`, so no state changes. No gas setting gets past this.

### Decision

- **`MAX_BATCH = 40`, with `TRANSFER_GAS = 5 TGas` and `CALLBACK_GAS = 15 TGas`. The agent attaches 300 TGas.** This fits under a 300 TGas ceiling with margin (44 measured), and 5 TGas is about 3× the mock token's cost, leaving headroom for real USDC. The agent splits larger runs into chunks.
- 40 payout items means roughly 20 bookings per transaction (owner + cleaner each). The demo needs far fewer.
- **Revisit after the Nov 2–3 testnet deploy.** Measure `ft_transfer` on the real testnet USDC contract and confirm the testnet gas ceiling. If USDC costs under 3 TGas and the ceiling is 1000 TGas, MAX_BATCH can go up toward 100, but never above it.

### Still open (not covered by this spike)

- Gas cost of the real USDC contract (testnet and mainnet IDs still to confirm, plan §12).
- What the rejection string looks like from near-api-js (spike #3).

## Spike #3 — scoped agent key from near-api-js (2026-11-01)

Code: `near-spikes/fc-key/spike.ts`. It starts a local nearcore 2.13.4 sandbox, deploys the spike #1 contracts and drives everything with **near-api-js 7.4.0**. That's the single-package v7, not the old `@near-js/*` packages; its API is `new Account(id, provider, keyOrSigner)`, `account.callFunction(...)` and the `actions.*` builders. Run it with `node spike.ts <near-sandbox-bin> <scratch-home>`; the binary is under `near-spikes/batch-payout/target/debug/build/near-sandbox-*/out/.near/`. This was done in a sandbox, not on testnet, because the testnet accounts from prep weren't created.

The agent account got a function-call key with `receiver = vault`, `methods = ["settle"]` and a 1 NEAR allowance. All of the following used **only that key**, and 12 of 12 behaved as expected:

| Attempt | Result | near-api-js error class |
|---|---|---|
| `settle` within policy | ✅ succeeds, owner paid, returns `true` | — |
| Another vault method (`get_spent`) as a transaction | rejected | `AccessKeyMethodNameMismatchActionError` |
| Call the token directly (`ft_transfer`) | rejected | `AccessKeyReceiverMismatchActionError` |
| `settle` with 1 yocto attached | rejected | `AccessKeyDepositWithFunctionCallActionError` |
| Transfer NEAR out of the agent account | rejected | `AccessKeyRequiresFullAccessActionError` |
| Add itself a full-access key | rejected | `AccessKeyRequiresFullAccessActionError` |
| Delete the agent account | rejected | `AccessKeyRequiresFullAccessActionError` |
| `settle` over cap | rejected by the contract | `ContractExecutionError`, message `Smart contract panicked: POLICY_REJECTED:OverCap` |
| Batch with an unregistered payee | **no throw**: `callFunction` returns `false`; key left unpaid | — |
| Allowance smaller than prepaid-gas cost | rejected before execution | `AccessKeyNotEnoughAllowanceActionError`, with `allowance` and `cost` fields |

Key-scope rejections happen when the transaction is validated, before anything executes; they come back with `txHash: ''`. That makes them different from policy rejections, which execute, fail on-chain and have a tx hash. `lib/near` should map the two families separately:
- **Key-scope errors** become "agent misconfigured or compromised". These should never happen in normal operation.
- **`POLICY_REJECTED:*`** errors become a rejection reason shown in the run view.
- **`AccessKeyNotEnoughAllowanceActionError`** means "agent key needs a top-up".

When a check fails, there's a fixed order: the deposit check comes before the receiver check, and the allowance check comes before the full-access check. An unauthorized call may therefore surface a different, but still rejecting, error class than you'd expect. Tests should assert "rejected", plus the class only where one specific rule is being tested.

### Allowance: what it costs

- **At submission, the key's allowance is charged the worst-case cost of the prepaid gas:** about **0.30 NEAR for 300 TGas** at the sandbox gas price of 1e8 yocto/gas (the mainnet minimum). That's roughly 10× the plain `gas × price`, because nearcore uses a pessimistic gas price for this reservation.
- **The unused gas is refunded to the allowance a few seconds later.** One 300 TGas `settle` reserved 0.293 NEAR, and its net cost was **0.00058 NEAR** once the refund landed.
- **Decision:** give the agent key an allowance of **2 NEAR** and keep the agent account's own balance small. That leaves enough headroom for consecutive 300 TGas chunks before earlier refunds land, while still capping what a leaked key can burn on gas. Attach gas per chunk (about 30 + 6 × n TGas) rather than a flat 300, so less allowance is reserved. The dashboard should show the remaining allowance.

### Confirms plan §2

- A function-call key can't transfer NEAR, can't attach deposits, and can only call the methods listed on the one receiver it's scoped to.
- Combined with spike #1, an agent running from a server only ever needs the `settle` key. The full-access key stays with the operator.

### NEAR AI Cloud (stretch, desk research only)

- OpenAI-compatible API at `https://cloud-api.near.ai/v1` with `sk-` bearer keys from cloud.near.ai. It exposes `POST /v1/chat/completions` and a model list at `/v1/model/list`.
- Inference runs in TEEs, with attestation and per-chat signature endpoints.
- That makes the triage stretch just an OpenAI SDK call with `baseURL` changed. I didn't call the live API; check the endpoints before relying on them.

## 1Click API, checked against the docs (2026-11-01, no live calls)

Source: docs.near-intents.org/api-reference/oneclick. Client: `web/lib/intents/client.ts`.

- **Base URL:** `https://1click.chaindefuser.com`.
- **Auth:** `X-API-Key: <key>` header (recommended); the legacy form is `Authorization: Bearer <JWT>`. With no key, the API still works but charges a 0.2% fee.
- **`POST /v0/quote`:**
  - Required fields: `dry`, `swapType` (`EXACT_INPUT|EXACT_OUTPUT|FLEX_INPUT|ANY_INPUT`), `slippageTolerance` (bps), `originAsset`, `depositType`, `destinationAsset`, `amount` (integer string in base units), `refundTo`, `refundType`, `recipient`, `recipientType` (`DESTINATION_CHAIN|INTENTS|CONFIDENTIAL_INTENTS`) and `deadline` (ISO).
  - `dry: true` omits `depositAddress`, `deadline` and `timeWhenInactive`.
  - The response's `quote` includes `depositAddress`, an optional `depositMemo`, `amountIn`, `minAmountIn`, `amountOut`, `minAmountOut`, `deadline`, `timeWhenInactive` and `timeEstimate`. The docs say to save the top-level `signature` with the quote, to resolve disputes.
- **`GET /v0/status?depositAddress=…`:**
  - `status` is one of `KNOWN_DEPOSIT_TX | PENDING_DEPOSIT | INCOMPLETE_DEPOSIT | PROCESSING | SUCCESS | REFUNDED | FAILED`. The docs describe none of them.
  - `swapDetails` includes `amountOut`, `depositedAmount`, `refundedAmount`, `refundReason`, `nearTxHashes`, and `originChainTxHashes` / `destinationChainTxHashes` (each `{hash, explorerUrl}`).
- **Confidential mode** (stretch goal): request option `confidentiality: public|basic|advanced`, plus `CONFIDENTIAL_INTENTS` for the deposit, refund and recipient types.

**Still to prove in spike #2** (the first real, tiny mainnet payment):
- That `recipientType: DESTINATION_CHAIN` with a NEAR account as `recipient` delivers via `ft_transfer` to the vault.
- That the vault being registered on USDC is enough for the delivery to land.
- What `destinationChainTxHashes` contains for a NEAR destination, and that `usdcCreditedTo()` finds the credit in that tx.
- The real minimum amounts per origin chain.

## Settlement agent on a real vault (2026-11-01, sandbox)

`web/test/integration/agent.sandbox.test.ts` runs the real app code against the real vault wasm and mock USDC on a local nearcore sandbox. That covers PGlite, planning, the pre-check, chunking, the vault client and the function-call key.

- **One run pays everyone in a single atomic `settle`.** Two bookings, each $500 collected with an $80 cleaning fee and a 15% management fee: Owen got $714, Maria $160, and the $126 management share stays in the vault.
- **A second run sends nothing.** Settled bookings aren't planned again, and the vault's `is_paid` keys back that up.
- **A full-access key on the agent account is refused before anything is sent.** The app checks the key's permission on-chain (`assertAgentKeyScoped`) and requires a function-call key with `receiver_id = vault` and methods exactly `["settle"]`.
- **An over-cap payout is held back by the pre-check and never sent.** Its reason is recorded.

**Two bugs found and fixed:**
- **The gas formula was wrong.** `30 + 6n` TGas came from spike #1, where the callback reserved 15 TGas. With the vault's real 30 TGas callback, a 4-item `settle` ran out of gas; it reverted safely and nothing moved. It's now `45 + 6n` (40 items → 285 TGas).
- **Finality lag.** `final` reads trail the latest block by about 2 blocks. Right after adding a key, the scope check said it wasn't registered. Key checks now read `optimistic` state, which is what tx validation uses. Planning views stay on `final` (conservative). Tests read balances at `optimistic`.
