# Handover — 2026-11-05

Where House Rules stands. Read with `CLAUDE.md` (rules, commands, versions), `plan.md` (scope, §9 timeline), `HACKATHON.md` (official rules) and `docs/needs-from-joseph.md` (what's left).

## TL;DR

- **Everything that doesn't need Joseph is done.** Every remaining step needs his money, accounts, camera or explicit yes: see `docs/needs-from-joseph.md`.
- **Not pushed.** `main` is ahead of `origin/main`; the repo is still private (the API returned 404 on 2026-11-05). Joseph decides when to push.
- **Not on mainnet.** Nothing has been deployed or paid there. `docs/mainnet-runbook.md` has every step. The real 1Click path is still unproven, and so is `INTENTS_SENDERS`.
- **Not verified live:** the NEAR AI rewording (no key).

## Last full verification (2026-11-05)

| Check | Result |
|---|---|
| typecheck, lint | clean |
| `pnpm --filter web test` | 402 passed |
| `pnpm --filter web e2e` | 28 passed, 3 screenshot specs skipped |
| `pnpm --filter web test:integration` (rebuilt wasm) | 14 passed, 1 skipped (needs the key file) |
| `pnpm --filter web test:testnet` | passed, live |
| `pnpm --filter web break-it` | all 5 attacks refused, balance unchanged, live |
| `cargo test -p vault --lib` / `--test sandbox` | 33 / 8 passed |
| clippy, `cargo fmt --check` | clean |
| Production build + server on a real Postgres wire connection | all 7 migrations, sign-up, import, every page, sign-in passed |
| Secrets in git history | none: long `ed25519:` strings are tx signatures in fixtures |
| agentshield | A (98/100) |

**One check lies a little:** the wire-protocol test used PGlite's socket server, so it proves the `pg` driver path and the migrations, not a hosted provider's connection limits or TLS. Run `db:migrate` and a sign-in on the real host.

## What changed Nov 3–5

- **Dark theme by default**, after the NEAR HACKATHON site's dark palette, with a light toggle. axe passes in both themes.
- **Sign-in redirect loop fixed:** a validly signed cookie for a user missing from this database bounced between `/login` and `/` forever. `requireUser()` now goes through `/api/auth/reset-session`, which clears only that kind of cookie.
- **Run status `held`** (migration `0006`): the pre-check stopped everything, so nothing was sent. `failed` now means something was sent and went wrong, or the run was stopped.
- **Overview: Collected by week**, server-rendered, bigint sums, integer bar heights, table view.
- **Own 404 and error pages**, an icon, starter assets removed. Next 16's error boundary prop is `retry`, not `reset`.
- **`pnpm --filter web preflight`:** read-only mainnet checks. It measured about 2.8 NEAR for the vault.
- **Hosting docs are provider-neutral:** any PostgreSQL 13+.
- **Pre-public cleanup:** agent safety rules in CLAUDE.md, deny rules in `.claude/settings.json`, client and personal names out of current docs. Old commits still contain the client's name inside rule text; nothing claims a partnership. Rewriting history would need a force-push, so it's left alone.
- **`HACKATHON.md`** is a snapshot of the live rules (Q-001 settles the pre-hackathon question). Re-read the live copy before submitting.
- **`airbnb-style-small.csv`:** the normal demo file is about $11,000, far over a $50 mainnet limit.
- **Testnet read-only tests use the archival RPC:** regular nodes prune transactions after a few days.

## What's next

**Claude, when Joseph says so:**
1. Push, after checking the repo is private.
2. Run the preflight with his account names, then support `docs/mainnet-runbook.md` and fix what mainnet turns up. Write `docs/mainnet-deployment.md` and update the README's status table.
3. `db:migrate` on the hosted database.
4. Test the NEAR AI call once there's a key: list models with `/v1/model/list`, set both env vars, try **Polish with NEAR AI** once.
5. Nov 12: full suites, agentshield, dry run of the demo script.
6. Nov 14: re-run the secret scan, re-read the live rules, build and print the submission payload, and send it only after his yes.

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
