# Demo script (2 minutes) and X post draft

For recording on **Nov 13**. Follows plan §11, matched to what the app actually does. Every on-screen claim below is checked by `web/e2e/readme.spec.ts` or the integration tests.

**Which mode to record in:**
- **Best: live on mainnet.** Needs the mainnet deploy (`docs/mainnet-runbook.md`). Use `web/test/fixtures/payout-reports/airbnb-style-small.csv` for shot 3: the normal demo file is about $11,000, far over the mainnet vault's $50 daily limit. Shots 3 and 4 then show **"4 will match"** and small amounts, so read the numbers off the screen rather than from this script.
- **Good: live on testnet.** Needs the agent key in `web/.env.testnet.local`. "View on-chain" links then open real testnet transactions.
- **Fallback: rehearsal mode.** Works today with no setup. Say "rehearsal" out loud; screens show *Simulated*.

## About an hour before recording: the real $1 payment

1. Claude switches the local app to live 1Click on mainnet (separate env file) and checks the settings.
2. Create a **$1 invoice** and pay it from MetaMask with **USDC on Base** (about $1.01). It should show **Paid** in about 35 seconds.
3. If it works, record shot 2 with a second $1 invoice. If it fails, there's still time to fix it or fall back to "here's one I ran earlier".

## Before you hit record (10 minutes)

- **Data:** a fresh account named after the business (e.g. *Casa Hosts*). Then:
  - payees Owen (owner, $800) and Maria (cleaner, $100), **approved in the vault**;
  - three properties: Casa Azul, Loft 21, Seaside Cottage ($80 cleaning, 15%);
  - the vault connected in Settings.
- **Don't import yet.** The import is part of the demo.
- **Window:** browser at 1280×800 and zoom 110%. The top bar shows the full nav.
- **Tabs:** (1) the app on **Invoices**; (2) a private window for the guest; (3) a terminal for the "try to break it" commands.
- **Voice:** calm, short sentences, never read the screen out word for word.

## Shot list

| # | Time | On screen | Say |
|---|---|---|---|
| 1 | 0:00–0:10 | **Hook.** Overview, then cut to Bookings (empty) | "Rental operators collect money from Airbnb, Booking.com and their own guests, then pay every owner and cleaner by hand. Nobody automates it, because whatever runs payouts can drain the account." |
| 2 | 0:10–0:30 | **Collect.** Invoices → charge Diego $200 "Damage: broken lamp" → copy the pay link → guest window: *USDC on Arbitrum* → *Get payment address* → (live: the guest pays; rehearsal: *simulate deposit*) → **Payment received** | "Guests pay from whatever chain they're on. NEAR Intents converts it, and the vault receives exactly two hundred dollars in USDC. Not a cent more or less." |
| 3 | 0:30–0:45 | **Reconcile.** Import → drop `airbnb-style.csv` → **"22 will match, 2 flagged, 1 duplicate"** → Import → Bookings: one row **blocked, $20.00 short** | "Drop in the Airbnb payout report. It's detected, matched, and anything that doesn't add up is blocked before anyone gets paid." |
| 4 | 0:45–1:10 | **Pay out.** Payouts → **Run agent now** → *Paid $9,917.37 to 40 payees in 1 transaction · 2 held back* → open **Held back**: *Owen for Diego Santos: Above this payee's per-payout limit, $816.85* → Audit log | "One click. The agent splits every booking (cleaner's fee, my fifteen percent, the owner gets the rest) and pays forty people in one atomic transaction. Notice what it *didn't* pay: Diego's damage money pushed Owen past his eight-hundred-dollar limit, so the vault's rules hold that booking back." |
| 5 | 1:10–1:40 | **Try to break it** (the key moment). Terminal: `pnpm --filter web break-it` (below), signed with the agent's own key: a stranger → `PayeeNotAllowed`; over the cap → `OverCap`; paid twice → `AlreadyPaid`; `withdraw` and `add_payee` → refused by NEAR; vault balance unchanged. Then **Vault rules** → *The agent can only call settle* | "So what if someone steals the agent's key? It's a NEAR function-call key: it can call one method, settle, and nothing else. No withdrawals, no new payees, no limit changes. And settle itself refuses anyone not on the list, anything over a cap, and anything already paid. The chain enforces it, not my server." |
| 6 | 1:40–2:00 | **Close.** Vault rules cards → Audit log (On-chain filter) → the README's tests table | "Humans set the rules. NEAR enforces them. House Rules, built at NEAR HACKATHON." |

### Terminal command for shot 5 (testnet)

```bash
pnpm --filter web break-it
```

It signs every attempt with **the agent's own settle-only key**, as a thief would:
1. pay a stranger $500: refused by the vault, `PayeeNotAllowed`;
2. pay the cleaner one cent over her cap: refused, `OverCap`;
3. pay a booking that's already paid: refused, `AlreadyPaid`;
4. `withdraw` the vault's USDC: refused by NEAR, the key can only call `settle`;
5. add itself as a payee: refused by NEAR, same reason.

It ends with the vault's balance before and after: nothing moved. Takes about 20 seconds; run it once before recording so the terminal is warm. It's testnet only, which suits this shot: nobody risks real money to prove the vault says no. Recorded run: `docs/testnet-deployment.md`.

## Fallback lines (if something misbehaves on camera)

- **The wallet or 1Click is slow:** "In production this takes about twenty seconds; here's one I ran earlier." Then cut to the Paid state.
- **In rehearsal mode:** "This is rehearsal mode. The same flow runs against the real vault in our integration tests, and on testnet here." Show `docs/testnet-deployment.md`.

---

# Draft X post

Must say "built at NEAR HACKATHON", tag @NEARProtocol and #NEARHackathon, lead with the user's problem, show one action → result, and say what NEAR enables. Attach the 2-minute video. **Don't post without Joseph's go-ahead.**

**Main post** (fits in 280 characters):

> Rental operators pay every owner & cleaner by hand, because automating it means trusting software with the bank account.
>
> House Rules: one click pays 40 people in one atomic tx, and the agent's NEAR key can only call `settle`.
>
> Built at NEAR HACKATHON @NEARProtocol #NEARHackathon

**Optional thread:**

1. Guests pay damage fees and direct bookings from other chains via NEAR Intents. The vault receives exact USDC.
2. Drop in an Airbnb payout report: matched, flagged, blocked if short. Only reconciled bookings get paid.
3. The vault enforces the operator's rules on-chain: allowlist, per-payout caps, a daily limit, a wait for new payees, each booking paid once. Our own agent can't break them.
4. Code, threat model and tests: (repo link once public). Operators: what would you need to see before letting software pay your cleaners?
