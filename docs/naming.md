# App name options

> **Decision (2026-11-01): House Rules.** Tagline: *Your payout rules, enforced on-chain.* Identifiers: display `House Rules`, package/repo `house-rules`, NEP-297 event standard `houserules`, session cookie `hr_session`. The rest of this file is kept as the decision record.

**The product in one line:** guests pay from any chain, a settlement agent pays owners and cleaners, and a NEAR vault makes it impossible for that agent to pay anyone, or any amount, outside the operator's rules.

**What the name has to do:**
- **Say what it is in five seconds.** Judges decide in the first moments of the demo whether a normal company could use this tomorrow (plan §3).
- **Read as fintech, not crypto.** No "chain", "coin", "DAO" or "-fi".
- **Hint at the rentals domain** (realworld track) **and the safety story** (security track: "an agent that can pay but can't steal").
- **Work in the demo line:** "Humans set the rules. NEAR enforces them."

I have **not** checked domains, trademarks or existing products for any of these names. Do that before you pick one.

---

## 1. House Rules (my pick)

Tagline: *Your payout rules, enforced on-chain.*

**Why this title**
- Every short-term rental has house rules: no parties, checkout by 11. Operators already think in that phrase.
- The product's core idea is the operator's payout rules: only these payees, at most $800 per payout, $3,000 per day, new payees wait 24 hours. The vault enforces them the way a host enforces house rules.
- It's the demo's closing line as a name: "Humans set the rules. NEAR enforces them."
- It fits the security track directly, since the vault is a policy engine for an AI agent.
- It reads as a business tool, not a token.

**Weaknesses**
- It's a common phrase, so it's hard to search for and to trademark. It probably needs a qualifier for a domain or handle (e.g. `houserules.app`, `HouseRules Pay`).
- It doesn't say "payments" on its own, so the tagline does that work.

## 2. Keystay

Tagline: *Give your payout agent a key, not the keys to everything.*

**Why this title**
- It has a double meaning. Operators hand out keys to stays, and the product's security rests on a NEAR **function-call access key** that can only call `settle` (spike #3: it can't withdraw, transfer NEAR, call other contracts or escalate).
- NEAR judges get the access-key reference instantly; rental operators hear "keys to the property".
- It's short, ownable, and easy to say.

**Weaknesses**
- The payments side is invisible. Without the tagline it could be a smart-lock or key-handover app.
- The clever half of the meaning only lands with people who know NEAR's access keys.

## 3. SettleStay (current working name)

Tagline: *Your payouts run themselves.*

**Why this title**
- It's literal: **settle** (the financial term for paying out what's owed, and the vault's own method name) plus **stay** (the rental).
- It's already used in the repo and docs, so keeping it costs nothing.

**Weaknesses**
- It covers automation but not safety, so the security track's story isn't in the name.
- "Settle" can also read as "settle for less".

## 4. Turnover

Tagline: *From checkout to payout.*

**Why this title**
- "Turnover" is the industry word for the clean between two stays, the exact moment the cleaner gets paid. It also means money flowing through a business.
- Operators would recognise it instantly.

**Weaknesses**
- It's a generic business word that's hard to own, and staff turnover is a common meaning.
- No safety angle.

## 5. Stayledger

Tagline: *Every payout, on the record.*

**Why this title**
- It leads with the accountant's view: reconciliation plus an on-chain audit log built from vault events (plan §4). It's what the operator's bookkeeper would care about.

**Weaknesses**
- "Ledger" leans crypto and is close to the hardware wallet brand.
- It sounds passive, a record-keeper, when the product actively pays people.

---

## Rejected quickly

- **Checkout:** it's a perfect double meaning, but it collides with Checkout.com and is far too generic.
- **Payrail / Guardrail:** good metaphors, but almost certainly taken in fintech or AI tooling.
- **Anything with "chain", "vault" or "-fi":** it signals crypto first, which breaks the design rule.

## Recommendation

**House Rules**, if a usable domain or handle exists. It's the only option that carries both the rentals domain and the "rules the agent can't break" story, and it matches the line the demo closes on. **Keystay** is the runner-up, being sharper for NEAR judges but weaker for anyone else.

## If you rename, do it before the vault contract is written (Nov 2)

Today the name is cosmetic: 13 files (page titles, auth copy, docs, `package.json`) and about 30 minutes of find-and-replace. Two things lock it in:
- **The vault's event `standard` field.** It's currently `"settlestay"`, in the spike only. Once the real vault emits it and the dashboard parses it, renaming means redeploying the contract.
- **The GitHub repo name.** It's embedded in the contract's on-chain source metadata (`repository` in `contracts/vault/Cargo.toml`).
