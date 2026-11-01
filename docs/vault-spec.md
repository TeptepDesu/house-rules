# House Rules Vault — contract spec

One vault per operator, deployed to its own account (e.g. `vault.<operator>.testnet`). It holds the operator's USDC (any NEP-141 token) and pays out **only** within the operator's rules. Source: `contracts/vault/`. This file is the source of truth for the interface. The app's parser (`web/lib/near/`) and its off-chain pre-check (`web/lib/agent/`) must match it.

Amounts are raw token units (USDC: 6 decimals), passed as decimal strings (`U128`). Times are nanoseconds (`U64` strings).

## Roles

| Role | Who | Can call |
|---|---|---|
| **owner** | Operator's wallet, full-access key | everything below, including `settle` |
| **agent** | Server-held **function-call key**, scoped to `settle` only | `settle` |
| anyone | | views |

Owner-only methods (`add_payee`, `remove_payee`, `set_limits`, `set_agent`, `withdraw`, `register_on_token`) need an attached deposit: exactly 1 yocto, or a storage deposit for `add_payee` and `register_on_token`. A function-call key can't attach deposits (spike #3), so the agent key can't call them **even if the key were scoped wider by mistake**. `settle` is not payable, so a deposit is rejected.

## State

```
owner: AccountId
agent: AccountId
token: AccountId                 // USDC contract
payees: Map<AccountId, Payee>    // { role: Owner|Cleaner, cap_per_payout, added_at_ns, active }
daily_limit: u128
window: { start_ns, spent }      // 24h window, starts at the first settle after the previous one expired
payee_delay_ns: u64              // a payee is payable only once now >= added_at_ns + payee_delay_ns
paid: Set<String>                // payout keys already paid ("<booking_id>:<role>"), on-chain idempotency
token_registered: bool           // vault's own NEP-145 registration on `token`
```

## Methods

| Method | Caller | Deposit | Notes |
|---|---|---|---|
| `new(owner, agent, token, daily_limit, payee_delay_ns)` | deployer (init) | storage deposit for the token (≥ its `storage_balance_bounds.min`) | Registers the vault on `token`; a callback sets `token_registered` |
| `register_on_token()` | owner | storage deposit | Retries registration if the init attempt failed |
| `add_payee(account_id, role, cap_per_payout)` | owner | ≥ token's storage min | Registers the payee on `token` (registration only; excess refunded to the vault). Re-adding a removed payee restarts its delay. Fails if the payee is already active |
| `remove_payee(account_id)` | owner | 1 yocto | Sets `active = false`. Already-scheduled batches are unaffected |
| `set_limits(daily_limit, payee_delay_ns)` | owner | 1 yocto | |
| `set_agent(agent)` | owner | 1 yocto | Rotates the agent account |
| `settle(items: [{key, payee, amount}])` | owner or agent | **0** | See below. Returns the callback's `bool` |
| `on_settled(items, total, window_start_ns)` | vault itself (`#[private]`) | — | Callback |
| `withdraw(amount, receiver_id)` | owner | 1 yocto | `ft_transfer` out; doesn't count toward the daily limit. **`receiver_id` must be registered on the token**; if not, the transfer fails, the vault keeps the funds and `withdraw_failed` is emitted. Returns the callback's `bool` |
| `on_withdrawn(amount, receiver_id)` | vault itself (`#[private]`) | — | Callback for `withdraw` |
| `on_registered()` | vault itself (`#[private]`) | — | Callback for `new` / `register_on_token` |

Views: `get_policy`, `get_payees`, `get_payee(account_id)`, `is_paid(key)`, `remaining_today`.

### `settle`

Checks run in this order. The first failure panics with its code, and nothing changes:

1. caller is `owner` or `agent`, else `Unauthorized`
2. `1 ≤ items.len() ≤ MAX_BATCH (40)`, else `BatchTooLarge` (also for an empty batch)
3. for each item, in order:
   - `amount > 0` and `key` is 1–64 bytes, else `InvalidItem`
   - payee known and `active`, else `PayeeNotAllowed`
   - `now ≥ added_at_ns + payee_delay_ns`, else `PayeeInDelay`
   - `amount ≤ cap_per_payout`, else `OverCap`
   - key not already paid, and not repeated within the batch, else `AlreadyPaid`
4. the window rolls over if `now ≥ start_ns + 24h`; `spent + total ≤ daily_limit`, else `DailyLimitExceeded`

Then it marks every key paid, adds `total` to `spent` and emits `settle_started`. It makes **one** `Promise::new(token)` with one `ft_transfer` action per item (1 yocto each from the vault's balance, `memo = key`, 5 TGas each), then calls `.then(on_settled)` with 30 TGas reserved.

`on_settled`:
- **Batch succeeded:** emit `settled` and return `true`.
- **Batch failed** (any action failed, so the whole receipt reverted):
  - unmark the keys and subtract `total` from `spent`, but only if the window hasn't rolled over since;
  - emit `settle_failed` and return `false`.

**A failed batch does NOT fail the transaction.** It finishes with `SuccessValue(false)`. Callers must check the return value or the events (spike #1, spike #3).

Gas: the agent attaches about `30 + 6 × n` TGas, at most 300.

## Error codes

Panic message format: `POLICY_REJECTED:<Code>`. From near-api-js this arrives as `ContractExecutionError`, with the message `Smart contract panicked: POLICY_REJECTED:<Code>`. Parse it with `/POLICY_REJECTED:([A-Za-z]+)/`.

| Code | Meaning |
|---|---|
| `Unauthorized` | Caller isn't owner (owner methods) or owner/agent (`settle`) |
| `BatchTooLarge` | 0 items or more than `MAX_BATCH` |
| `InvalidItem` | Zero amount, or key empty or longer than 64 bytes |
| `PayeeNotAllowed` | Unknown or removed payee |
| `PayeeInDelay` | Payee was added less than `payee_delay_ns` ago |
| `OverCap` | Amount above the payee's `cap_per_payout` |
| `AlreadyPaid` | Key paid before, or repeated in the same batch |
| `DailyLimitExceeded` | Would push this window's spend over `daily_limit` |

Other owner-method failures use plain panics, not policy codes: wrong deposit, payee already active, insufficient storage deposit.

## Events

NEP-297 logs, `EVENT_JSON:{"standard":"houserules","version":"1.0.0","event":…,"data":…}`, emitted on success paths only.

| Event | data |
|---|---|
| `vault_registered` / `vault_registration_failed` | `{ token }` |
| `payee_added` | `{ account_id, role, cap_per_payout, payable_from_ns }` |
| `payee_removed` | `{ account_id }` |
| `limits_changed` | `{ daily_limit, payee_delay_ns }` |
| `agent_changed` | `{ old, new }` |
| `settle_started` | `{ items: [{key, payee, amount}], total }` |
| `settled` | `{ keys: [..], total }` |
| `settle_failed` | `{ keys: [..], total }` |
| `withdrawn` / `withdraw_failed` | `{ amount, receiver_id }` |

**Audit-log rule (spike #1):** only read events from receipts whose status is success. A reverted token receipt still carries `nep141 ft_transfer` logs for transfers that were undone. The vault's `settled` and `settle_failed` events are the source of truth for payouts.

## Known limits

- **100 actions per receipt** is a protocol cap. `MAX_BATCH = 40` stays well under it, and under a 300 TGas transaction.
- **Measured on the sandbox with the mock token:** a full 40-item batch burns about 89 TGas in total. On the failure path the restore callback burns 5.9 TGas of its 30 TGas reservation, even while unmarking 40 keys.
- **The real USDC contract's `ft_transfer` gas cost hasn't been measured yet.** It's assumed to be 5 TGas or less; re-measure on testnet.
- The daily window is a 24h window that starts at the first settle after the previous one expired. It isn't a sliding window.
