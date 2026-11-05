# Mainnet runbook

Exact steps from "wallet funded" to "full loop proven on mainnet". **Real money.** Every signing step needs Joseph's explicit OK (CLAUDE.md). Nothing here has been run on mainnet yet. The same sequence was run on testnet (`docs/testnet-deployment.md`), and the preflight script has been checked against mainnet's USDC and 1Click, read-only.

Commands use near-cli-rs 0.30.1 syntax, from its bundled guide. Run them from the repo root in your own terminal, so the keys stay in your Keychain.

```bash
export OP=<your-account>.near      # operator: owns the vault
export VAULT=vault.$OP
export AGENT=agent.$OP
export OWNER=<owner-payee>.near    # someone's account, with their permission
export CLEANER=<cleaner-payee>.near
export USDC=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1  # native USDC, 6 decimals (docs/notes.md)
```

## What it costs

| Item | NEAR |
|---|---|
| Vault account: 184 KB of contract storage is about 1.84 NEAR, plus state and margin | 3 |
| Agent account, including its gas allowance | 0.5 |
| Gas and USDC registrations (about 0.001 NEAR each) | 0.5 |
| **Total** | **about 4** |

Most of the vault's NEAR is locked as storage, not spent.

## 0. Before signing anything

```bash
pnpm --filter web preflight -- --account $OP --payee $OWNER --payee $CLEANER
(cd contracts/vault && cargo near build non-reproducible-wasm)
```

Fix anything marked ✗. Payees that aren't registered on USDC are fine at this point: `add_payee` registers them.

If `rpc.mainnet.near.org` rate-limits you, set `NEAR_RPC_URL` to another provider from https://docs.near.org/api/rpc/providers.

## 1. Put your operator key on this machine

```bash
near account import-account
```

Choose **using-seed-phrase**, then **mainnet**. This stores the key in your Keychain.

## 2. Create the vault and agent accounts

```bash
near account create-account fund-myself $VAULT '3 NEAR' autogenerate-new-keypair save-to-keychain sign-as $OP network-config mainnet sign-with-keychain send
near account create-account fund-myself $AGENT '0.5 NEAR' autogenerate-new-keypair save-to-keychain sign-as $OP network-config mainnet sign-with-keychain send
```

## 3. Deploy the vault

The demo limits are a **$50 daily limit** (`50000000`) and a **10-minute** new-payee wait (`600000000000` ns). Testnet uses the same wait so a demo isn't held up for a day. Tell the audience it's short for the demo.

```bash
near contract deploy $VAULT use-file contracts/target/near/vault/vault.wasm \
  with-init-call new json-args "{\"owner\":\"$OP\",\"agent\":\"$AGENT\",\"token\":\"$USDC\",\"daily_limit\":\"50000000\",\"payee_delay_ns\":\"600000000000\"}" \
  prepaid-gas '100 TGas' attached-deposit '0.01 NEAR' network-config mainnet sign-with-keychain send
```

The attached deposit pays for the vault's own USDC registration. Excess is refunded to the vault.

## 4. Create the agent's settle-only key

```bash
near account add-key $AGENT grant-function-call-access --allowance '0.25 NEAR' --contract-account-id $VAULT --function-names settle autogenerate-new-keypair save-to-keychain network-config mainnet sign-with-keychain send
```

Copy this new key's private key from Keychain Access, the same way as on testnet (`docs/testnet-deployment.md`). **Never use the agent account's full-access key.** The app checks on-chain and refuses to run with one.

## 5. Point the app at mainnet

Create `web/.env.mainnet.local` (gitignored). Agents can't read it, and shouldn't:

```
NEAR_NETWORK=mainnet
AGENT_MODE=live
AGENT_ACCOUNT=<the $AGENT value>
AGENT_PRIVATE_KEY=ed25519:<the settle-only private key>
ONECLICK_MODE=live
USDC_ASSET_ID=nep141:17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1
USDC_TOKEN_ACCOUNT=17208628f84f5d6ad33f0da3bbbeb27ffcb398eac501a31bd6ad2011e36133a1
INTENTS_SENDERS=intents.near
```

`USDC_ASSET_ID` and `USDC_TOKEN_ACCOUNT` were confirmed read-only on 2026-11-02. `INTENTS_SENDERS` is **not** confirmed: it's the code's default, and the first real payment settles it (step 8).

Run it locally:

```bash
cd web && set -a && . ./.env.mainnet.local && set +a && pnpm exec next dev
```

On Vercel, put the same values in the project's environment variables instead (`docs/deploy.md`).

## 6. Connect the wallet, vault and payees

In the app, on a new account:
1. **Settings:** link your wallet (`$OP` in Meteor) and connect the vault (`$VAULT`).
2. **People & properties:** add the owner and the cleaner, then **Approve in vault** for each. Your wallet signs `add_payee`.
3. Add three properties named **Casa Azul**, **Loft 21** and **Seaside Cottage**, with owner and cleaner set, a **$1** cleaning fee and **15%** management.
4. Set each payee's limit to fit the small report: **$10** for the owner, **$2** for the cleaner.

Wait out the 10 minutes until both show **Active**.

## 7. Check everything, read-only

```bash
pnpm --filter web preflight -- --account $OP --vault $VAULT --agent $AGENT --payee $OWNER --payee $CLEANER
```

Everything must pass. In particular, the vault must be registered on USDC, or 1Click deliveries fail.

## 8. The first real payment, $1

1. Create a **$1 invoice** and open its pay page in a private window.
2. Choose **USDC on Base**, enter your refund address and get the payment address.
3. Send the exact amount from MetaMask (about $1.01).
4. It should show **Paid** in about 35 seconds. The audit log should show it, and the preflight's vault balance should go up by $1.

If the invoice stays unverified after 1Click reports success, read `destinationChainTxHashes` from the status response. `usdcCreditedTo()` needs the signer in `INTENTS_SENDERS`, so update that value and record what you found in `docs/notes.md`.

## 9. The full loop

1. Fund the vault with a guest payment or a USDC transfer, enough for the payouts below.
2. **Import** [`web/test/fixtures/payout-reports/airbnb-style-small.csv`](../web/test/fixtures/payout-reports/airbnb-style-small.csv): four bookings, $26.27 collected, one short by $1.85 so the blocked state shows. Its stays are in early November, so they're all due by recording day.
3. Check it reconciles, then **Payouts → Run agent now**.
4. Check the owner and the cleaner received USDC, using **View on-chain**, and that the audit log matches.

## 10. Afterwards

- Claude writes the accounts and tx hashes into `docs/mainnet-deployment.md` and updates the README's status table.
- `withdraw` sends leftover USDC to your own account, signed by your wallet from **Vault rules**. Register your account on USDC first if the preflight says so.
- **Optional, irreversible:** delete the full-access key on `$VAULT`, so nobody can ever replace the contract. That's the strongest security story, but it also means no upgrades. Only do it after the full loop works.

## Fallback

The rules don't require mainnet here. Testnet-only projects are eligible, and mainnet applies only where the integration is mainnet-only (`HACKATHON.md`, Q-010). If mainnet runs out of time, record on testnet, as `docs/demo-script.md` describes, and show the real 1Click payment on its own.
