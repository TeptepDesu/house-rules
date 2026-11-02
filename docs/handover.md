# Handover — 2026-11-02

Where House Rules stands, what's half-done, and what's next. Read with `CLAUDE.md` (rules, commands, versions), `plan.md` (scope) and `docs/needs-from-joseph.md` (Joseph's checklist).

## TL;DR

- **The app is feature-complete for the plan's core scope.** Every core item in plan §7 is built and tested, and the testnet proof is done.
- **One stretch feature is half-done and uncommitted:** guest follow-up messages with optional NEAR AI rewording. See [In progress](#in-progress-uncommitted).
- **7 local commits are not pushed.** The repo `TeptepDesu/house-rules` is still private; check that before pushing. Joseph decides when to push.
- **What's left is mostly Joseph's:** mainnet funds, hosting, the demo recording and the submission.

## State of the repo

| | |
|---|---|
| Branch | `main` (trunk only) |
| Last pushed | `07363a7` |
| Local, unpushed | `2056e4d` → `464effe` (7 commits, listed below) |
| Uncommitted | Follow-up messages / NEAR AI triage (in progress) |
| Servers running | None |

Unpushed commits, oldest first:
1. `2056e4d` Overview dashboard. The rehearsal vault now applies the real vault's rules.
2. `9633d5d` Waive a charge. It's refused while a guest payment could still arrive.
3. `8ece030` Owner vault actions: exact wallet calls and chain checks, proven on a real vault in the sandbox.
4. `2e7c280` Manage payees (change limit, remove) and vault limits/withdraw from the app, signed by the owner's wallet.
5. `f868f43` Accept a short or over payout as final. Adds migration `0005`.
6. `5e483ad` Direct bookings: a booking plus its stay invoice, paid from any chain.
7. `464effe` Design-review screenshot spec for the action screens.

**Last full verification**, at `5e483ad`, before the in-progress work:
- typecheck and lint: clean;
- `pnpm --filter web test`: 357 passed;
- `pnpm --filter web e2e`: 19 passed, 2 screenshot specs skipped;
- `pnpm --filter web test:integration`: 14 passed, 1 skipped (live testnet, which needs the key file).

Contract suites are unchanged since the last run: 33 unit and 8 sandbox tests.

## What was built this session

**Verified on testnet with Joseph:**
- **The app's agent paid live through `vault.houserules-operator.testnet`** with the settle-only key, using `pnpm --filter web test:testnet`.
- **Real-wallet flow with Meteor:**
  - linked the wallet (NEP-413);
  - connected the vault;
  - approved `houserules-cleaner-2.testnet`, which went *In waiting period* → *Active*.
- **`pnpm --filter web break-it`:** five stolen-agent-key attacks, all refused on testnet (results in `docs/testnet-deployment.md`):
  - refused by the vault: a stranger, over the cap, and an already-paid booking;
  - refused by NEAR's key permissions: `withdraw` and `add_payee`.

**Bugs found and fixed:**
- **The rehearsal vault paid unapproved payees and ignored its daily limit.** It's now `lib/vault/rehearsal.ts`, which applies the contract's rules in the contract's order. The rehearsal limit is $20,000/day.
- **The People page kept showing *In waiting period* after the delay.** Statuses now sync from the vault while a payee is waiting.
- **The waive/quote race.** `recordPaymentStart` and `waiveInvoice` both take the invoice row lock.
- **Approve and Manage were unreachable on phones.** Payee actions now sit under the name at every width.

**New features:** listed in the README's **Also try** section, each with its own browser test.

**Docs:**
- `docs/deploy.md`: Vercel + hosted Postgres guide. The production build was checked with no env vars.
- Confirmed 1Click values and dry-quote costs in `docs/notes.md`.
- The README walkthrough is now 14 steps (adds "approve payees" and "Overview").

## In progress (uncommitted)

**Guest follow-up messages + optional NEAR AI rewording** (plan §7 stretch 2).

| File | What |
|---|---|
| `web/lib/triage/index.ts`, `pay-link.ts`, `index.test.ts` | Deterministic drafts for `open_penalty` / `unpaid`; `keepsTheFacts` guard; `polishWithNearAi` (OpenAI-style call, 15 s timeout, returns null on any doubt). **8 unit tests pass** |
| `web/app/(dashboard)/bookings/follow-up-actions.ts` | `draftFollowUpFor`, `polishFollowUp`. The draft is built server-side from the operator's own records |
| `web/components/bookings/follow-up.tsx` | **Message guest** dialog: subject, editable body, Copy, and *Polish with NEAR AI* (shown only when configured) |
| `web/app/(dashboard)/bookings/page.tsx` | Button on `open_penalty` / `unpaid` rows |
| `web/lib/db/invoices.ts` | `openInvoicesForBooking` |
| `web/lib/audit/describe.ts` + test | `followup.polish` audit text |
| `web/e2e/follow-up.spec.ts` | Browser test. **Written but never run to completion:** the run was interrupted |

**Safety design:**
- The model never sees the pay link, only the `{PAY_LINK}` placeholder, which the browser swaps after any AI step.
- A rewrite is discarded if any of these hold:
  - it changes or adds a dollar amount;
  - it drops or duplicates the link;
  - it adds any URL.
- Nothing is ever sent.
- Config: `NEAR_AI_API_KEY` + `NEAR_AI_MODEL` (and optionally `NEAR_AI_BASE_URL`, default `https://cloud-api.near.ai/v1`). The feature is off unless both are set.

**To finish:**
1. `pnpm --filter web e2e e2e/follow-up.spec.ts`. Fix what it finds. The clipboard-permission and axe parts are the likeliest to need adjustment.
2. Run the full suites (typecheck, lint, test, e2e).
3. Update the README: "Also try" bullet, test counts, and env vars in `docs/deploy.md`.
4. Commit.
5. **The live NEAR AI call is unverified:** there's no key, and the endpoint and model names come from desk research. Before calling it done, get a key from cloud.near.ai, list models (`/v1/model/list`), and try one rewrite.

## What's next

**Claude can do these without Joseph:**
1. Finish the follow-up feature above.
2. Optional: overview charts (the last cut-line item, low value).
3. Optional: a mainnet preflight script. It would be read-only, checking USDC registration for Joseph's account, a dry quote and status reachability. It needs Joseph's mainnet account name.
4. Before the repo goes public: `npx -y ecc-agentshield scan --path .` (CLAUDE.md).

**Joseph** (details in `docs/needs-from-joseph.md`):
1. **Push** when ready. Confirm the repo is still private first; it stays private until Nov 14.
2. **Fund wallets a few days early:**
   - about 1 NEAR on a mainnet account (Meteor);
   - $2–5 of USDC plus about $1 of ETH on Base (MetaMask).
3. **Hosting by Nov 10:** follow `docs/deploy.md`. Apply migrations `0000`–`0005` to the hosted DB with `db:migrate`. Open decision: production refuses mock 1Click, so a hosted testnet deploy can't take guest payments.
4. **Nov 13:** do the $1 real 1Click rehearsal payment about an hour before recording (`docs/demo-script.md`), then record. Shot 5 is `pnpm --filter web break-it`.
5. **Nov 14:** make the repo public after the agentshield scan, then submit (`realworld` + `security` + `business`, about 12:00 UTC).
6. Still open:
   - paste the hackathon rules (→ `HACKATHON.md`);
   - the Discord question;
   - ask Nomad before naming them.

## Things to know before touching code

**Testnet:**
- `web/.env.testnet.local` holds the settle-only agent key and is gitignored. **Never read or print it.** Check variables with booleans only, as done this session.
- To run the app against testnet: `cd web && set -a && . ./.env.testnet.local && set +a && pnpm exec next dev`. Next's dev server rejects `node --env-file`.
- Testnet accounts:
  - `houserules-operator.testnet` (vault owner; in Joseph's Meteor);
  - `vault.` and `usdc.houserules-operator.testnet`;
  - `houserules-agent.testnet`, with settle-only key `BkN4…`;
  - payees `houserules-owner-1`, `houserules-cleaner-1` and `houserules-cleaner-2.testnet`.

**Testing:**
- **Only one Next dev server can run per folder.** Stop any app run before `pnpm e2e`.
- Views read at `final` finality lag about 2 blocks. Owner-action confirms retry with `untilOnChain` (about 8 s) before offering "Check again".
- `e2e/helpers.ts → approveAllPayees` is required before any rehearsal payout test: unapproved payees are now refused, like on-chain.
- The README walkthrough is enforced by `e2e/readme.spec.ts`. Change both together.

**Design and safety rules:**
- Changing a payee's limit = `remove_payee` + `add_payee` in one transaction. **The waiting period restarts**, by design.
- Withdrawals only ever go to the operator's own linked wallet.
