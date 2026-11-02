# House Rules — Agent Guide

House Rules is an autonomous back office for short-term rental operators, built for the NEAR HACKATHON (window ends 14 Nov 2026 23:59 UTC). Monorepo with two disciplines:
- **`web/`** — Next.js (App Router) + React + Tailwind + shadcn/ui, API routes, Postgres via Drizzle (PGlite locally, any hosted Postgres in production), near-api-js, NEAR Intents 1Click API.
- **`contracts/vault/`** — Rust smart contract (near-sdk-rs) that holds the operator's USDC and enforces payout policy on-chain.

Guests pay invoices from any chain via 1Click → exact USDC lands in the vault. Bookings are reconciled. A settlement agent pays owners and cleaners through the vault using a function-call key scoped to `settle` only.

**Sources of truth, read before working in an area:**
- `plan.md` — scope, priorities, cut line, timeline. Don't build anything outside the current day's scope without asking.
- `docs/vault-spec.md` — contract interface, events, error codes.
- `design.md` — visual system: palette (stone + ledger green), IBM Plex, components, status map (`web/lib/ui/status.ts`). Written before the second page.
- `HACKATHON.md` — official rules. Re-read before anything submission-related.

Record exact framework/library versions here at scaffold time. Don't assume versions from memory; check the installed `package.json` / `Cargo.toml`.

## Versions

Recorded at scaffold, 2026-11-01. Update when you bump something.

| Area | Version |
|---|---|
| Toolchain | rustc/cargo 1.99.1 (host); contract pinned to **1.93.0** via `contracts/vault/rust-toolchain.toml`; cargo-near 0.22.0; near-cli-rs 0.30.1; Node 25.9.0; pnpm 12.16.1 |
| Web | Next **16.4.3** (App Router, `cacheComponents` + `partialPrefetching` on, `proxy.ts` replaces `middleware.ts`), React 19.3.0, TypeScript 5.9.3, Tailwind 4.3.3 |
| UI | shadcn CLI 4.23 (`base-nova` style, **Base UI** primitives `@base-ui/react` 1.9.0, not Radix), `cn` 0.5.1 (shadcn's clsx+tailwind-merge replacement, re-exported from `@/lib/utils`), lucide-react 1.65.0 |
| Data/auth | drizzle-orm 0.45.4, drizzle-kit 0.31.11, pg 8.23.1 (node-postgres, used when `DATABASE_URL` is set), @electric-sql/pglite 0.5.13 (local dev + tests when it isn't), jose 6.2.14, bcryptjs 3.0.3, zod **4**.6.7 |
| Tests | vitest 5.0.5, fast-check 4.10.2, @playwright/test 1.64.1 (Chromium) |
| NEAR JS | near-api-js **7.4.0** (single package, v7 API: `new Account(id, provider, key)`, `callFunction`, `actions.*`; typed errors in `near-api-js/rpc-errors`). Verified in spike #3, not yet installed in `web/` |
| Contract | near-sdk 5.29.1; integration tests use **near-sandbox 0.3.16 + near-api 0.8.7 + cargo-near-build 0.11.5** (the current `cargo near new` template), not near-workspaces |

**Next 16 is newer than most training data.** Read the bundled docs in `web/node_modules/next/dist/docs/` before writing Next code (see `web/AGENTS.md`). With `cacheComponents`, any `cookies()`/session read must sit behind `<Suspense>`.

## Repo map

| Area | Path | Notes |
|---|---|---|
| Pages | `web/app/` | `(dashboard)/` for operators (overview, bookings, invoices, payouts, rules, audit, people, import, settings); `pay/[publicId]/` public guest pay page |
| API routes | `web/app/api/` | invoices, pay/intents, import, agent/run |
| NEAR client | `web/lib/near/` | vault calls, view calls, event parsing, tx verification |
| 1Click client | `web/lib/intents/` | tokens, quote, status. Mocked in tests |
| Pure domain logic | `web/lib/{reconcile,splits,importers,agent,vault,audit}/` | No I/O in reconcile/splits/plan/rules/describe. `agent/run.ts` takes the vault as a parameter. Heaviest test coverage |
| DB | `web/lib/db/` | Single module every query goes through |
| Migrations | `web/drizzle/` | Drizzle Kit |
| UI primitives | `web/components/ui/` | shadcn. Extend, don't fork |
| Feature components | `web/components/` | |
| Design tokens | `web/app/globals.css` | |
| E2E tests | `web/e2e/` | Playwright |
| Test fixtures | `web/test/fixtures/` | Synthetic payout reports, recorded RPC responses |
| Contract | `contracts/vault/src/` | |
| Contract tests | `contracts/vault/src/tests.rs` (unit), `contracts/vault/tests/sandbox.rs` | near-sandbox + near-api against `contracts/mock-ft` |
| Mock USDC | `contracts/mock-ft/` | NEP-141/145 via near-contract-standards; unrestricted `mint`, so test-only. Never deploy it to mainnet |
| Docs | `docs/` | vault spec, schema, edge cases, notes |
| Agent permissions | `.claude/settings.json` | Committed. Denies reads of `.env*` |

---

## Process

These skills govern *how* work gets done. Scaled for a 14-day solo build:

| When the task is… | Use |
|---|---|
| Starting a new **module** (vault contract, agent, importer, pay flow, reconciliation) | `brainstorming` first. Not needed for individual components or small routes inside an agreed module |
| Executing the day's slice of `plan.md` | `executing-plans`, with `plan.md` as the plan. Don't write a separate plan |
| Any bug, test failure, or unexpected behaviour | `systematic-debugging` before proposing a fix |
| Work in `lib/splits`, `lib/reconcile`, `lib/importers`, `lib/agent`, or the vault contract | `test-driven-development`. Required; these are what judges and money depend on |
| About to claim something works, is fixed, or passes | `verification-before-completion` (**required**) |
| Acting on review feedback | `receiving-code-review` |

Use the built-in `/code-review` for diffs. Work on trunk; no worktrees or feature-branch ceremony.

---

## Frontend

Read the skill's `SKILL.md` before hand-rolling UI when one covers the task:

| When the task is… | Use |
|---|---|
| Writing `design.md` / greenfield page / anti-slop check | `hallmark` |
| Building or styling components (Tailwind + shadcn) | `ui-styling` |
| Component polish and design judgment calls | `emil-design-eng` |
| Tokens, spacing and type scales | `design-system` |
| Choosing a library (charts, QR, tables) | `pick-ui-library` (explicit invoke) |
| Toasts, including promise/loading states for tx status | `ask-sonner` |
| Any animation | `animate`. Keep motion minimal; this is a finance tool |

### FE conventions

- shadcn/ui is the base layer: primitives in `web/components/ui/`, feature components in `web/components/`.
- Conditional classes go through `cn()`. No string concatenation.
- Icons: lucide-react. Dates: `web/lib/ui/format.ts` (built-in `Intl`, calendar dates without timezone drift); no date library.
- **Money display goes through one helper**, `formatUsd(raw: bigint)` in `web/lib/money.ts`. Never `Number(raw)` and never float math on amounts.
- Data fetching in server components or route handlers. Client components only for interactivity (wallet signing, polling, forms).
- Respect `prefers-reduced-motion` in every animation.

### UI direction (summary; `design.md` is the full version)

- Structure references: Stripe Dashboard (overview, payments list, payout detail, events log, test-mode banner), Stripe hosted invoice page (guest pay page), Ramp spend controls (vault policy cards). Patterns only, never their branding.
- **Fintech, not crypto.** Names before addresses ("Maria – cleaner", account in small text), dollars before tokens, tx hashes behind "view on-chain". No neon, no gradients.
- **Own palette and type.** Do not reuse the Nomad Payment Portal's design system or tokens.

### Automation hooks — every interactive element gets a `data-testid`

UI that can't be selected reliably can't be tested reliably. Add the hook while building, not when a test fails.

- **`data-testid`, never `id`.** Component libraries generate their own ids for aria wiring.
- **Selector priority:** role + accessible name first, `data-testid` second (no stable name, repeated controls, or user-authored text).
- **Naming:** `<feature>-<element>[-<qualifier>]`, kebab-case, from the domain, not the DOM.
  Examples: `invoice-row-status`, `payee-card-{payeeId}`, `policy-rule-daily-limit`, `agent-run-button`, `settlement-split-row-{bookingId}-{role}`, `audit-event-row-{txHash}`, `pay-page-deposit-address`, `import-preview-summary`.
- **List items get a business key, never an index.**
- **Always tagged:** controls, form fields and their errors, rows/cards, dialogs, toasts, menus, and every empty/loading/error state. That includes tx states: `pending`, `confirmed`, `rejected`.
- **Wrapper components must forward the attribute to the DOM.** Verify in the rendered DOM.
- **Portal roots get a testid** (dialogs, sheets, dropdowns, toasts).

---

## Domain skills

| Skill | Source | Status |
|---|---|---|
| near-api-js | `near/agent-skills` | Review the source, then install if it checks out |
| Vitest / Testing Library patterns | `wshobson/agents` → `javascript-typescript` | Optional |

Not installed on purpose: `payment-processing` (Stripe/PayPal-centric, wrong rails), `ui-design` (duplicates the FE set), `backend-development` (wrong altitude). Record installs in this table.

---

## Backend

Generic skills don't know this repo; where they disagree with this section, this section wins.

### Route handler non-negotiables

1. **Auth first.** Operator session verified before any work. Never trust a client-supplied user id, role, amount, recipient, or account id.
2. **Parameterized queries only**, via Drizzle.
3. **Validate the body** (zod) and return `400` with a specific message before touching the DB.
4. **Mutations are logged** to `activity_log`.
5. **Errors:** log server-side with context, return a generic message. Never leak stack traces, SQL, keys, or env values.
6. **`/api/agent/run`** requires an operator session or the scheduler's secret header. Runs must be idempotent.
7. **Payment status is never taken from the client.** The server confirms via the 1Click status endpoint and on-chain data.
8. **Secrets (1Click JWT, agent function-call key) are server-only.** Never import them into client components; never prefix with `NEXT_PUBLIC_`.

Paste the reference handler here once the first full one exists (auth + validation + mutation + log), and name its file.

### Money

- **All amounts are `bigint` in raw micro-USDC (6 decimals) end to end:** DB, logic, contract args.
- **`BigInt` is not JSON-serializable.** Serialize amounts as decimal strings at API boundaries; parse back with `BigInt()`.
- Split math lives only in `lib/splits` and must preserve `cleaner + mgmt + owner == collected`.
- Contract and app enforce the same policy rules. When a rule changes, update both and both test suites.

### Data layer

- **Postgres only. No SQLite.** `web/lib/db/client.ts` picks the driver:
  - `DATABASE_URL` set: `pg` (node-postgres). Works with any hosted Postgres (Neon, Supabase, RDS) or a local server.
  - `DATABASE_URL` unset (dev/tests only): **PGlite**, real Postgres compiled to WASM, running in-process. No Docker or install needed. Data in `web/.data/pglite` (gitignored); tests use `PGLITE_DIR=memory://`. It applies `web/drizzle/` migrations on startup.
  - Production without `DATABASE_URL` throws; it never silently uses PGlite. Same for `SESSION_SECRET`: dev falls back to a labelled insecure constant, production throws.
- Drizzle with `bigint` columns in `mode: 'bigint'`. Check every money column returns `bigint`, not `string` or `number`.
- All queries go through `web/lib/db/`.

---

## Smart contract (`contracts/vault/`)

- Rust + near-sdk-rs, built with `cargo-near`, tested with near-sandbox + near-api against a mock FT.
- **Payout batches use one `Promise::new(token)` with chained `.function_call("ft_transfer", …)` actions, then `.then(on_settled)`.** Never `.and()` for payouts: separate receipts don't roll back together.
- The vault attaches 1 yoctoNEAR per `ft_transfer` from its own balance. The agent calls `settle` with 0 deposit.
- Owner-only methods require exactly 1 yocto (`assert_one_yocto`) so a function-call key can't call them.
- Callbacks are `#[private]` and restore state (paid keys, daily spend) on failure.
- Policy violations panic with `POLICY_REJECTED:<Code>`. Codes are listed in `docs/vault-spec.md` and must stay in sync with the app's parser.
- Events are NEP-297 `EVENT_JSON:` logs on success paths only.
- Every policy rule has a contract test **and** a matching app pre-check test.

---

## Guardrails

- **Know which network and which database you're pointed at before anything that writes.** Check `NEAR_NETWORK` and which `DATABASE_URL` (if any) is set every time. A mainnet value left in `.env.local` turns a test into real money.
- **Never deploy to mainnet, sign mainnet transactions, or spend tokens without Joseph's explicit confirmation**, each time.
- **Never push, force-push, make the repo public, post anything, or send the hackathon submission without Joseph's explicit confirmation.**
- **No full-access key ever lives on the server or in the app's env.** The agent key is a function-call key scoped to `vault.settle`.
- **Never commit keys or print an env file.** Print variable names only, or nothing.
- **1Click has no testnet.** Development uses `dry` quotes and mocks; real 1Click calls only with tiny amounts on dedicated dev accounts, after confirmation.
- **Never send email or messages just to exercise a code path.**
- **Design tokens and `data-testid` values are load-bearing.** Grep all usages (including `web/e2e/`) before renaming or removing one.
- **Verify per folder.** A red build from pre-existing errors elsewhere isn't necessarily your change; scope checks to what you touched.
- **No Nomad Properties code, data, branding, or design tokens.** Synthetic data only.
- **README must stay accurate for judges:** "do X → see Y" steps, libraries and AI-generated code disclosed, LICENSE present.
- **Audit the harness:** `npx -y ecc-agentshield scan --path .` before making the repo public.

---

## Commands

Run from the repo root (pnpm workspace). On the Mac, pnpm lives in `~/.local/bin` and Homebrew belongs to another macOS user. On Windows, everything runs in Ubuntu on WSL: see `docs/new-machine-windows.md`.

```bash
# web
pnpm --filter web dev
pnpm --filter web build
pnpm --filter web lint
pnpm --filter web typecheck      # next typegen && tsc --noEmit
pnpm --filter web test           # vitest run (+ fast-check), fast unit/DB tests
pnpm --filter web test:integration   # ~30s: real vault wasm + mock USDC on a local NEAR sandbox, real agent code + scoped key
                                     # needs contracts built: (cd contracts/vault && cargo near build non-reproducible-wasm) etc.
pnpm --filter web test:testnet   # LIVE testnet: the app's agent pays through vault.houserules-operator.testnet (needs web/.env.testnet.local)
pnpm --filter web break-it       # LIVE testnet demo shot 5: stolen-agent-key attacks, all refused; balance unchanged. Testnet only
# running the app against testnet: Next dev rejects --env-file, so load the file into the shell:
#   cd web && set -a && . ./.env.testnet.local && set +a && pnpm exec next dev
pnpm --filter web db:generate    # drizzle-kit generate → web/drizzle/
pnpm --filter web db:migrate     # hosted Postgres only: applies web/drizzle/ to DATABASE_URL (from web/.env.local). PGlite migrates itself
pnpm --filter web e2e            # Playwright (Chromium): starts `next dev` on :3200 with a fresh PGlite db (.data/e2e), testnet
SCREENSHOT_DIR=/abs/dir pnpm --filter web e2e   # also saves login/overview/people screenshots for design review
# first time on a machine: pnpm --filter web exec playwright install chromium
# re-record real RPC fixtures (web/test/fixtures/rpc) after a contract change; sandbox only:
#   (cd contracts/vault && cargo near build non-reproducible-wasm); (cd contracts/mock-ft && cargo near build non-reproducible-wasm)
#   cd web && node scripts/record-rpc-fixtures.mts <near-sandbox-bin> <scratch-dir>
#   near-sandbox-bin: contracts/target/debug/build/near-sandbox-*/out/.near/near-sandbox-*/near-sandbox

# contracts (cargo workspace: vault + mock-ft)
cd contracts
cargo test -p vault --lib                                # 32 unit tests: every policy rule, check order, callbacks (<1s)
cargo test -p vault --test sandbox -- --test-threads=4   # 8 sandbox tests: real wasm + mock USDC (~1 min)
(cd vault && cargo near build non-reproducible-wasm)     # → contracts/target/near/vault/vault.wasm
cargo clippy -p vault --target wasm32-unknown-unknown -- -D warnings   # plain `cargo check` errors by design on contracts
cargo fmt --all --check
```

Auth layout: `web/lib/auth/token.ts` (pure JWT, used by `proxy.ts` and tests), `session.ts` (cookie I/O), `dal.ts` (`requireUser()`, the real check), `password.ts` (bcrypt). Server actions in `web/app/(auth)/actions.ts`.

**Which checks lie:**
- Playwright with mocked 1Click proves nothing about real 1Click. The real path is only verified by a manual tiny mainnet payment.
- Testnet settlement with a mock FT proves nothing about mainnet USDC contract IDs or storage registration. Run the full loop on mainnet before Nov 10's freeze.
- Local PGlite proves the SQL and migrations, not the hosted database's schema or connection limits. Run `db:migrate` against the hosted database and smoke-test sign-in there before the Nov 10 freeze.

---

## Next 16 gotchas found the hard way

- **React 19 resets `<form action>` after every action.** Server actions must echo submitted values (`values` in state, never passwords) and fields use `defaultValue={values.x}`, or a validation error wipes the user's input. E2E asserts this.
- **Session reads call `await connection()`** before time-dependent checks (`lib/auth/session.ts`), or Cache Components flags `Date.now()` during prerender.
- **A no-JS form POST to a page with `<Suspense>` data only re-renders the static shell.** Verify dashboard forms in a real browser (Playwright), not with curl.
- **Playwright screenshots inject `caret-color` and trigger a hydration warning.** Pass `caret: "initial"`.
- **Pages and route handlers are separate bundles in dev.** Process-wide singletons (DB client, mock 1Click store) must live on `globalThis`, or each bundle gets its own copy. Two PGlite instances on one data dir was a real bug.
- **Public pages with no session read** (e.g. `/pay/[publicId]`) need `await connection()` before data access, or the DB client's internal clock trips Cache Components.

## Installing the skills

`.claude/skills/` is gitignored. Copy it from an existing project, or follow the "Installing the skills" table in `CLAUDE.template.md`. Copy `.claude/settings.json` too; it's the only committed file in `.claude/`. Restart the session after installing.
