# Testnet deployment

Deployed 2026-11-01 with near-cli (keys in the macOS Keychain). **Testnet only: no real money.** The token is the **mock USDC** from `contracts/mock-ft`; its `mint` is unrestricted, so it's test-only and never goes to mainnet.

## Accounts

| Role | Account | Notes |
|---|---|---|
| Operator (vault owner, full-access wallet) | `houserules-operator.testnet` | Signs `add_payee`, `set_limits`, `withdraw` |
| Vault | `vault.houserules-operator.testnet` | `contracts/vault`, init below |
| Mock USDC (6 decimals) | `usdc.houserules-operator.testnet` | `contracts/mock-ft` |
| Agent | `houserules-agent.testnet` | Has a **function-call key** for the app (below) |
| Property owner (payee) | `houserules-owner-1.testnet` | Cap $800 per payout |
| Cleaner (payee) | `houserules-cleaner-1.testnet` | Cap $100 per payout |

## Vault policy (as deployed)

- **Owner:** `houserules-operator.testnet`. **Agent:** `houserules-agent.testnet`.
- **Token:** `usdc.houserules-operator.testnet`. `token_registered` is true (`vault_registered` event).
- **Daily limit:** $3,000 (`3000000000`).
- **New-payee delay:** **10 minutes** (`600000000000` ns). Kept short for demos; production would use 24 hours.
- **Funded with:** $5,000 mock USDC.

## Transactions

| What | Tx |
|---|---|
| Create `usdc.` sub-account | (near-cli output, no hash captured) |
| Create `vault.` sub-account | `2m3QabSRKwvTKC2aYxGjLYn5ypuiifYaWh2FHqpMPbH4` |
| Deploy + init mock USDC | `BykFM5vKXsQi54F9nCkCLSHQJJGLBXPvepLW3PmgPgHB` |
| Deploy + init vault (registers itself on USDC) | `8ZBXFKVU7pDGxLaB9w5E3KdqByMfLQ8aNmd6z63XRRA` |
| `add_payee` owner-1 ($800 cap) | `EyLo6na9gnReu4jkmiCha6kQhW9uwap96Vmtd7BUaHQP` |
| `add_payee` cleaner-1 ($100 cap) | `9uaAGroAcVEUkPTDfmvZ53ieYG67xigEbfnzoycF1qNw` |
| Mint $5,000 to the vault | `EZB24MELXMsVcwCzqvXqLTKiUcPeqa6LP1YSTRgakSLo` |
| Agent function-call key (settle only) | `GTQ7fSavaFGM3EgL6Gk1L9MEtoJ1h5LrQPLHMYCWgudg` |

Explorer: `https://testnet.nearblocks.io/txns/<hash>`. Vault: `https://testnet.nearblocks.io/address/vault.houserules-operator.testnet`.

## The agent key

- **Public key:** `ed25519:BkN4MTEq7Hok3EFu5pJKAFy5HZcXtgSJmn38BCG1kU8K`. Its private key is in the macOS Keychain, saved by near-cli.
- **On-chain permission**, read back from RPC:
  ```json
  {"FunctionCall": {"allowance": "2000000000000000000000000", "method_names": ["settle"], "receiver_id": "vault.houserules-operator.testnet"}}
  ```
- `houserules-agent.testnet` **also** has a full-access key, created with the account. The app **refuses** to run with that one (`assertAgentKeyScoped`). Only the `BkN4M…` key goes into the server env.

**To run the app live on testnet**, Joseph does this once. Claude doesn't handle private keys.
1. Open **Keychain Access**, search for `houserules-agent.testnet`, and open the entry whose name includes `BkN4MTEq7Hok3EFu5pJKAFy5HZcXtgSJmn38BCG1kU8K`. Copy the private key (`ed25519:…`).
2. Create `web/.env.testnet.local` (gitignored; Next doesn't auto-load it, so normal dev and tests stay in rehearsal):
   ```
   NEAR_NETWORK=testnet
   AGENT_MODE=live
   AGENT_ACCOUNT=houserules-agent.testnet
   AGENT_PRIVATE_KEY=ed25519:<the BkN4M… private key>
   ```
3. Tell Claude. It then runs the app live against this vault, and the app's own key check confirms it's the scoped key.

## Policy checks done on testnet

Signed with near-cli and refused by the vault with readable reasons:
- The operator paid owner-1 during the waiting period: `POLICY_REJECTED:PayeeInDelay`.
- The operator paid an account that isn't a payee: `POLICY_REJECTED:PayeeNotAllowed`.
- owner-1 (neither owner nor agent) called `settle`: `POLICY_REJECTED:Unauthorized`.

## Payout verified on testnet

Signed by the operator, which the vault allows as owner, after the 10-minute payee delay:

- **One `settle`, two payouts, atomic:** owner-1 got **$7.20** and cleaner-1 **$2.00**. Tx `5zJgtUU7UyyCJrg9ynVgWoggPRTKLT5ctZahckM5Gqas`:
  - events: `settle_started`, then 2 × `ft_transfer`, then `settled`; the return value is `true`;
  - **9.06 TGas** burnt in total: vault 3.17, token 3.41 for both transfers, callback 1.5.
  - Balances afterwards: owner-1 7.2, cleaner-1 2.0, vault 4,990.8 mock USDC.
- **Paying cleaner-1 $100.000001** (above the $100 cap) was refused: `POLICY_REJECTED:OverCap`.
- **Paying `demo-bk1:owner` again** was refused: `POLICY_REJECTED:AlreadyPaid`.

That's five different policy refusals on testnet: PayeeInDelay, PayeeNotAllowed, Unauthorized, OverCap and AlreadyPaid.

## The app's agent, live on testnet (2026-11-02)

`pnpm --filter web test:testnet` ran the app's real agent code against this vault with the settle-only key: one run paid owner-1 **$7.20** and cleaner-1 **$2.00**, the $0.80 management share stayed in the vault, and every balance matched on-chain.

## Approve in vault with a real wallet (2026-11-02)

In the app (live mode, Meteor wallet): linked `houserules-operator.testnet` by signing a NEP-413 message, connected the vault (the app checked owner and agent on-chain), added `houserules-cleaner-2.testnet` and approved it with **Approve in vault**. It showed *In waiting period*, then *Active* after the 10-minute delay.

## "Try to break it" with the stolen agent key (2026-11-02)

`pnpm --filter web break-it` signs every attempt with the agent's settle-only key:

| Attempt | Refused by | Result |
|---|---|---|
| Pay `thief.testnet` $500 | the vault | `PayeeNotAllowed`, tx `53urv2cQu7hZpwoBKCt2hHfy5L2a2KLuqL2a7ofF2bgX` |
| Pay cleaner-1 one cent over the $100 cap | the vault | `OverCap`, tx `DP3CdBv1ZoBQwwqHLwpURY7b6RXvz5UgsiFjacUzpWv7` |
| Pay `demo-bk1:owner` a second time | the vault | `AlreadyPaid`, tx `HK2FcPB6x75vXx1xDt13QpTms41YgNTPScHf1X2SGasU` |
| `withdraw` to `thief.testnet` | NEAR (key permission) | never reaches the vault |
| `add_payee thief.testnet` | NEAR (key permission) | never reaches the vault |

The vault held $4,981.60 before and after.

## Upgrade: payable time fixed at approval (code review #10)

Tx `XVp5L9Cp8P6WHTYj3hAMyUzE2LxRnYJM1hGVQBGgeiK` deploys new vault code without init. `Payee.payable_from_ns` is now stored when the payee is approved, so a later `set_limits` can't shorten or lengthen an existing payee's wait.

It's the same field slot and type as the old `added_at_ns`, so state carried over. Payees, policy and paid keys all read back correctly after the upgrade. The two existing payees' stored values now read as their approval time, which was already in the past.
