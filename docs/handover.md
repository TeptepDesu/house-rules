# Handover — 2026-11-03

Where House Rules stands, what's half-done, and what's next. Read with `CLAUDE.md` (rules, commands, versions), `plan.md` (scope) and `docs/needs-from-joseph.md` (Joseph's checklist).

## TL;DR

- **The app is feature-complete for the plan's core scope.** Every core item in plan §7 is built and tested, and the testnet proof is done.
- **Stretch: guest follow-up messages are done and committed.** The optional NEAR AI rewording hasn't been tried against the live API. See [Follow-up messages](#follow-up-messages-finished-2026-11-03).
- **Joseph is moving to a Windows laptop (Ubuntu on WSL).** Setup steps, and what to bring over from the Mac: [`docs/new-machine-windows.md`](new-machine-windows.md). See [Moving machines](#moving-machines).
- **9 local commits are not pushed.** The repo `TeptepDesu/house-rules` is still private (checked 2026-11-03: the API returns 404). Push before switching laptops. Joseph decides when to push.
- **What's left is mostly Joseph's:** mainnet funds, hosting, the demo recording and the submission.

## State of the repo

| | |
|---|---|
| Branch | `main` (trunk only) |
| Last pushed | `07363a7` |
| Local, unpushed | `2056e4d` → `HEAD` (9 commits: the 7 below, the handover, the follow-up messages) |
| Uncommitted | Nothing |
| Servers running | None |

Unpushed commits, oldest first:
1. `2056e4d` Overview dashboard. The rehearsal vault now applies the real vault's rules.
2. `9633d5d` Waive a charge. It's refused while a guest payment could still arrive.
3. `8ece030` Owner vault actions: exact wallet calls and chain checks, proven on a real vault in the sandbox.
4. `2e7c280` Manage payees (change limit, remove) and vault limits/withdraw from the app, signed by the owner's wallet.
5. `f868f43` Accept a short or over payout as final. Adds migration `0005`.
6. `5e483ad` Direct bookings: a booking plus its stay invoice, paid from any chain.
7. `464effe` Design-review screenshot spec for the action screens.

**Last full verification**, at the follow-up commit (2026-11-03):
- typecheck and lint: clean;
- `pnpm --filter web test`: 367 passed;
- `pnpm --filter web e2e`: 20 passed, 3 screenshot specs skipped;
- `pnpm --filter web test:integration`: 14 passed, 1 skipped (live testnet, which needs the key file). Last run at `5e483ad`; nothing it covers has changed since.

Contract suites are unchanged since the last run: 33 unit and 8 sandbox tests.

## Moving machines

The Mac was the only machine so far. On the new laptop:
- **Code:** clone `main` after the push. Everything else needed comes with it, including `.claude/settings.json`, which denies agent reads of `.env*`.
- **Not in git, bring by hand:** `web/.env.testnet.local` (settle-only agent key). The testnet deployer keys (`vault.` / `usdc.houserules-operator.testnet`) are in the Mac's Keychain and are only needed to redeploy or upgrade the testnet contracts. The operator account is in Meteor (seed phrase).
- **Mac-only notes that no longer apply:** "pnpm lives in `~/.local/bin`", "Homebrew belongs to another user", "keys in the macOS Keychain". On WSL: nvm Node, global pnpm, and near-cli's file keychain.
- **Claude's memory stays on the Mac.** Two notes worth carrying over: (1) before any push, check the repo is private with `curl -s -o /dev/null -w '%{http_code}\n' https://api.github.com/repos/TeptepDesu/house-rules` (`404` = private; on `200`, stop and ask); (2) the repo goes public only at submission, Nov 14, after the agentshield scan.
- **First check on the new machine:** the suites in step 7 of the setup guide should match the counts below. If they don't, debug before building anything new.

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

## Follow-up messages (finished 2026-11-03)

**Guest follow-up messages + optional NEAR AI rewording** (plan §7 stretch 2) are committed. Code is in `web/lib/triage/`, `web/app/(dashboard)/bookings/follow-up-actions.ts`, `web/components/bookings/follow-up.tsx` and `web/e2e/follow-up.spec.ts`.

**Safety design:**
- The model never sees the pay link, only the `{PAY_LINK}` placeholder. The browser swaps it in after any AI step.
- A rewrite is discarded if it changes or adds a dollar amount, drops or duplicates the link, or adds any URL.
- Nothing is ever sent.
- Config: `NEAR_AI_API_KEY` + `NEAR_AI_MODEL` (optionally `NEAR_AI_BASE_URL`, default `https://cloud-api.near.ai/v1`). The feature is off unless both are set. These are listed in `docs/deploy.md`. **`web/.env.example` doesn't list them yet**, because agent reads of `.env*` are denied. Joseph: add them there by hand.

**Verified at this commit:** typecheck and lint clean; `test` 367 passed; `e2e` 20 passed, 3 screenshot specs skipped. `test:integration` was not re-run because nothing in `lib/near` or `lib/agent` changed.

**Still unverified: the live NEAR AI call.** There's no key, and the endpoint and model names come from desk research. Get a key from cloud.near.ai, list the models (`/v1/model/list`), set both env vars, and try **Polish with NEAR AI** once. Until then the README marks it as untested live.

## What's next

**Claude can do these without Joseph:**
1. Verify the live NEAR AI call once there's a key (above).
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
