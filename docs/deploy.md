# Deploying the web app (Vercel + hosted Postgres)

For Nov 4 (plan §9: hosting Nov 4, mainnet Nov 5, app done Nov 6). About 30 minutes, most of it clicking. **Secrets go into Vercel's settings, never into chat, the repo or a file Claude reads.**

Checked locally on 2026-11-02:
- `pnpm --filter web build` succeeds with **no** env vars, so a missing variable can't break the build.
- A production server with no secrets refuses to work instead of running insecurely: it logs `SESSION_SECRET is not set`.
- The dev payment simulator returns 404 in production.

## 1. Hosted Postgres (5 min)

Any provider works. Neon's free tier is fine.

1. Create a project, e.g. `house-rules`, in a region near Vercel's default (US East).
2. Copy the **connection string**. For Neon, use the **pooled** one (host contains `-pooler`) and keep `?sslmode=require`.
3. Apply the migrations once, from the laptop:
   - Put `DATABASE_URL=<string>` into `web/.env.local` (gitignored).
   - Tell Claude "run db:migrate". It runs `pnpm --filter web db:migrate` without reading the file.
   - Then delete the line from `web/.env.local` if you like. Locally the app uses PGlite whenever `DATABASE_URL` is unset.

## 2. Vercel project (10 min)

1. vercel.com → **Add New → Project** → import `TeptepDesu/house-rules`. Private repos are fine.
2. **Root Directory: `web`**. The framework is detected as Next.js. Leave the build and install commands on their defaults.
3. Add the environment variables from the table below, then **Deploy**.

**If the install step fails** with a pnpm error: we use pnpm 12, and Vercel's docs list support up to pnpm 10. Add the env var `ENABLE_EXPERIMENTAL_COREPACK=1` so Vercel uses the exact version pinned in `web/package.json` (`packageManager`), then redeploy. Our lockfile is format 9.0, which Vercel's pnpm reads, so the default should work.

## 3. Environment variables (Vercel → Settings → Environment Variables, Production)

| Name | Value | Secret? |
|---|---|---|
| `DATABASE_URL` | the pooled connection string from step 1 | **yes** |
| `SESSION_SECRET` | output of `openssl rand -base64 48` | **yes** |
| `NEAR_NETWORK` | `mainnet` for the demo (`testnet` for a test deploy) | no |
| `AGENT_MODE` | `live` (production refuses `mock`) | no |
| `AGENT_ACCOUNT` | the agent account on that network | no |
| `AGENT_PRIVATE_KEY` | the agent's **settle-only function-call key**. Never a full-access key; the app checks on-chain and refuses one | **yes** |
| `ONECLICK_MODE` | `live` (production refuses `mock`) | no |
| `USDC_ASSET_ID`, `USDC_TOKEN_ACCOUNT`, `INTENTS_SENDERS` | confirmed in spike #2; see `web/.env.example` | no |
| `AGENT_RUN_SECRET` | output of `openssl rand -base64 32`, for the scheduled runs | **yes** |
| `ONECLICK_API_KEY` | optional; without it 1Click charges 0.2% | **yes** |
| `NEAR_RPC_URL` | optional; defaults to the public NEAR RPC for `NEAR_NETWORK` | no |
| `NEAR_AI_API_KEY`, `NEAR_AI_MODEL` | optional; set **both** to show *Polish with NEAR AI* on guest follow-ups (key from cloud.near.ai) | key: **yes** |
| `NEAR_AI_BASE_URL` | optional; defaults to `https://cloud-api.near.ai/v1` | no |

**Open decision (Nov 4):** production refuses mock 1Click, and 1Click only delivers on mainnet. So a hosted **testnet** deploy can't take guest payments. The rest works there: import, payouts and the vault pages. Either deploy straight to mainnet (the plan), or decide we want a hosted testnet preview and Claude adds a clearly labelled exception.

## 4. Scheduled payouts (2 min, optional)

GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**:
- `APP_URL`: the Vercel URL, e.g. `https://house-rules.vercel.app` (no trailing slash).
- `AGENT_RUN_SECRET`: the same value as in Vercel.

`.github/workflows/agent-schedule.yml` then calls `/api/agent/run` every 6 hours. Until both exist it skips quietly. **Run agent now** works without them.

## 5. Smoke test after deploy (5 min)

1. Open the URL: the login page loads. On testnet a "Test mode · NEAR testnet" banner shows; on mainnet there is none.
2. Sign up, then link your wallet in **Settings**, then save the vault account. Saving checks owner and agent on-chain.
3. **Vault rules** shows the policy read from the chain, with *"The agent can only call settle"* in green.
4. Vercel → **Logs**: no errors. Tell Claude what you see if anything is red.

**Which checks lie** (CLAUDE.md): local PGlite proves the SQL, not the hosted database. Step 5 is the real check of the hosted schema and connection.

Sources: [Vercel package managers](https://vercel.com/docs/package-managers), [Vercel corepack issue](https://www.Github.com/vercel/vercel/issues/11607).
