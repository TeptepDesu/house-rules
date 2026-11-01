# Demo script (2 minutes) and X post draft

For recording on **Nov 13**. Follows plan §11, matched to what the app actually does. Every on-screen claim below is checked by `web/e2e/readme.spec.ts` or the integration tests.

**Which mode to record in:**
- **Best: live on mainnet.** Needs spike #2 and the mainnet deploy.
- **Good: live on testnet.** Needs the agent key in `web/.env.testnet.local`. "View on-chain" links then open real testnet transactions.
- **Fallback: rehearsal mode.** Works today with no setup. Say "rehearsal" out loud; screens show *Simulated*.

## Before you hit record (10 minutes)

- **Data:** a fresh account named after the business (e.g. *Casa Hosts*). Then:
  - payees Owen (owner, $800) and Maria (cleaner, $100), **approved in the vault**;
  - three properties: Casa Azul, Loft 21, Seaside Cottage ($80 cleaning, 15%);
  - the vault connected in Settings.
- **Don't import yet.** The import is part of the demo.
- **Window:** browser at 1280×800 and zoom 110%. The sidebar shows the full nav.
- **Tabs:** (1) the app on **Invoices**; (2) a private window for the guest; (3) a terminal for the "try to break it" commands.
- **Voice:** calm, short sentences, never read the screen out word for word.

## Shot list

| # | Time | On screen | Say |
|---|---|---|---|
| 1 | 0:00–0:10 | **Hook.** Overview, then cut to Bookings (empty) | "Rental operators collect money from Airbnb, Booking.com and their own guests, then pay every owner and cleaner by hand. Nobody automates it, because whatever runs payouts can drain the account." |
| 2 | 0:10–0:30 | **Collect.** Invoices → charge Diego $200 "Damage: broken lamp" → copy the pay link → guest window: *USDC on Arbitrum* → *Get payment address* → (live: the guest pays; rehearsal: *simulate deposit*) → **Payment received** | "Guests pay from whatever chain they're on. NEAR Intents converts it, and the vault receives exactly two hundred dollars in USDC. Not a cent more or less." |
| 3 | 0:30–0:45 | **Reconcile.** Import → drop `airbnb-style.csv` → **"22 will match, 2 flagged, 1 duplicate"** → Import → Bookings: one row **blocked, $20.00 short** | "Drop in the Airbnb payout report. It's detected, matched, and anything that doesn't add up is blocked before anyone gets paid." |
| 4 | 0:45–1:10 | **Pay out.** Payouts → **Run agent now** → *Paid $9,917.37 to 40 payees in 1 transaction · 2 held back* → open **Held back**: *Owen for Diego Santos: Above this payee's per-payout limit, $816.85* → Audit log | "One click. The agent splits every booking (cleaner's fee, my fifteen percent, the owner gets the rest) and pays forty people in one atomic transaction. Notice what it *didn't* pay: Diego's damage money pushed Owen past his eight-hundred-dollar limit, so the vault's rules hold that booking back." |
| 5 | 1:10–1:40 | **Try to break it** (the key moment). Terminal, testnet commands below: pay a stranger → `POLICY_REJECTED:PayeeNotAllowed`; pay over the cap → `OverCap`; pay a booking twice → `AlreadyPaid`. Then **Vault rules** → *The agent can only call settle* | "So what if someone steals the agent's key? It's a NEAR function-call key: it can call one method, settle, and nothing else. No withdrawals, no new payees, no limit changes. And settle itself refuses anyone not on the list, anything over a cap, and anything already paid. The chain enforces it, not my server." |
| 6 | 1:40–2:00 | **Close.** Vault rules cards → Audit log (On-chain filter) → the README's tests table | "Humans set the rules. NEAR enforces them. House Rules, built at NEAR HACKATHON." |

### Terminal commands for shot 5 (testnet; Claude can run them on cue)

The operator signs these, but the vault refuses on rules, not on who signed.

```bash
# pay someone who isn't on the allowlist
near contract call-function as-transaction vault.houserules-operator.testnet settle json-args '{"items":[{"key":"demo-x:owner","payee":"houserules-agent.testnet","amount":"1000000"}]}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as houserules-operator.testnet network-config testnet sign-with-keychain send
# pay the cleaner over her $100 cap
near contract call-function as-transaction vault.houserules-operator.testnet settle json-args '{"items":[{"key":"demo-y:cleaner","payee":"houserules-cleaner-1.testnet","amount":"100000001"}]}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as houserules-operator.testnet network-config testnet sign-with-keychain send
# pay a booking that was already paid
near contract call-function as-transaction vault.houserules-operator.testnet settle json-args '{"items":[{"key":"demo-bk1:owner","payee":"houserules-owner-1.testnet","amount":"7200000"}]}' prepaid-gas '100 Tgas' attached-deposit '0 NEAR' sign-as houserules-operator.testnet network-config testnet sign-with-keychain send
```

**Optional:** "the agent key can't even call withdraw". This needs the agent's function-call key selected in near-cli. The integration test `agent_function_call_key_can_only_settle` proves it on a sandbox; show that test's green output if a live attempt is awkward.

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
4. Code, threat model and tests: (repo link once public)
