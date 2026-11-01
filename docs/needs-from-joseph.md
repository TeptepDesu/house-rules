# What I need from you (Joseph)

Everything that's blocked on you, in the order it starts to matter. Each item says **why** and **by when**. Tick items off here, or just tell me in chat.

_Last updated: 2026-11-01 (after the testnet deploy)_

---

## Whenever you're back at the laptop (5 minutes)

- [ ] **Say "push"** when you want the local commits on GitHub. I check that the repo is still private before every push.
- [ ] **Add pnpm to your shell** (one line, once):
  ```bash
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshenv
  ```
- [ ] **Quit Docker Desktop** if it's still running; we don't use it. PGlite gives us Postgres without Docker.

## Testnet: deployed ✅ (one step left for you)

The vault, mock USDC, payees and a settle-only agent key are live on testnet. Details are in [testnet-deployment.md](testnet-deployment.md). No Keychain prompt was needed after all.

- [ ] **Copy the agent key into `web/.env.testnet.local`** (5 minutes, steps in [testnet-deployment.md](testnet-deployment.md#the-agent-key)). It's the `BkN4M…` function-call key from Keychain Access. I don't handle private keys, so this one's yours. Then tell me, and I'll run the app live against the testnet vault.

## Before the real 1Click payment (spike #2): needed by Nov 5

- [ ] **A funded mainnet account for testing**, e.g. `houserules-dev.near`, with about **1 NEAR** for gas and storage.
- [ ] **About $5–10 of a token on another chain** (e.g. USDC on Arbitrum or Base) in a wallet you control. That's the "guest" paying an invoice from another chain.
- [ ] **A 1Click API key** (optional). Without one, 1Click works but charges **0.2%**. The plan says to apply in prep. The key goes into `web/.env.local` as `ONECLICK_API_KEY`.
- [ ] **Spike #2 will also confirm** three settings for live mode: `USDC_ASSET_ID`, `USDC_TOKEN_ACCOUNT` and `INTENTS_SENDERS` (see `web/.env.example`). Until then the app runs 1Click in mock mode, and the full guest-payment flow works and is tested.
- [ ] **Your explicit OK for each mainnet transaction.** I never sign or spend on mainnet without it (CLAUDE.md).

## Before deploying the website: needed by Nov 10

- [ ] **A hosted Postgres `DATABASE_URL`** for production. Any provider works (Neon's free tier is fine). Locally we don't need one; the app uses PGlite.
- [ ] **A `SESSION_SECRET`** for production. Generate it with `openssl rand -base64 48`, and put both values into **Vercel** env vars, not into chat or the repo.
- [ ] **A Vercel project** linked to the GitHub repo.
- [ ] **Mainnet for the demo** (plan §10):
  - a few NEAR for the vault deploy, storage and gas;
  - about **$30 USDC** to collect and pay out on camera;
  - a mainnet owner and cleaner account (yours or friends', with permission).

## For live payouts (after the testnet deploy)

- [ ] **The agent's function-call key in the production server env (Vercel):** `AGENT_ACCOUNT` and `AGENT_PRIVATE_KEY` (the settle-only key). The app checks on-chain that this key can only call `vault.settle` and refuses to run otherwise. Never paste a full-access key there.
- [ ] **For scheduled runs:** add GitHub repo secrets `APP_URL` and `AGENT_RUN_SECRET` (≥32 random chars, the same value as the app's env). The workflow is in `.github/workflows/agent-schedule.yml` and does nothing until both exist. The **Run agent now** button works without them.

## Hackathon admin

- [ ] **Paste the official hackathon rules** (or a link). I'll save them as `HACKATHON.md`; CLAUDE.md points there, and it doesn't exist yet.
- [ ] **The Discord question about pre-hackathon work** (plan §12, still open).
- [ ] **NEAR AI Cloud credits** ($10 by joining NEAR Builders), only if we do the AI-triage stretch goal.
- [ ] **Nomad:** ask them before naming them as a design partner (plan §0). Until then, no Nomad names, data or branding anywhere.
- [ ] **Nov 13:** record the demo video (I'll prepare the script and the demo data) and draft the X post. It must say "built at NEAR HACKATHON" and tag `@NEARProtocol` `#NEARHackathon`.
- [ ] **Nov 14:** decide on making the repo public. I'll run `npx -y ecc-agentshield scan --path .` first. Submit with tracks `realworld` + `security` + `business`, aiming for 12:00 UTC.

## Optional, makes my work better

- [ ] **Install the Claude skills** CLAUDE.md expects (`hallmark`, `ui-styling`, `emil-design-eng`, `test-driven-development`, …) into `.claude/skills/`, then restart the session. I've been following their intent by hand.
- [ ] **Tell me the GitHub repo URL if it ever changes.** It's embedded in the contract's on-chain metadata (`contracts/vault/Cargo.toml`).

---

## Already done (no action)

- Toolchain: Rust, cargo-near, near-cli, Node and pnpm.
- Testnet accounts created; keys in the Keychain.
- Private repo `TeptepDesu/house-rules`, with pushes so far.
- Database switched to plain Postgres (PGlite locally), so no Neon is needed for development.
