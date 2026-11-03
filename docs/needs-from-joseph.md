# What I need from you (Joseph)

Everything that's blocked on you, in the order it starts to matter. Each item says **why** and **by when**. Tick items off here, or just tell me in chat.

_Last updated: 2026-11-03 (timeline pulled forward: app done Nov 6, enhancements Nov 7–11; plan §9)_

---

## Today, Nov 3

- [ ] **Say "push"** when you want the local commits on GitHub. I check that the repo is still private before every push.
- [ ] **Start buying the mainnet funds now.** They're needed on **Nov 5**, and exchange withdrawals and identity checks can be slow. The full list is under [Mainnet: Nov 5](#mainnet-nov-5).
- [ ] **Add pnpm to your shell** (one line, once):
  ```bash
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshenv
  ```

## Testnet: deployed ✅ (one step left for you)

The vault, mock USDC, payees and a settle-only agent key are live on testnet. Details are in [testnet-deployment.md](testnet-deployment.md). No Keychain prompt was needed after all.

- [x] **Copy the agent key into `web/.env.testnet.local`.** Done 2026-11-02. `pnpm --filter web test:testnet` passed: the app's agent paid owner-1 $7.20 and cleaner-1 $2.00 through the testnet vault with the settle-only key.

## To try "Approve in vault" with a real wallet (optional, 10 minutes)

- [x] **Real-wallet flow on testnet.** Done 2026-11-02 with Meteor: linked `houserules-operator.testnet` (NEP-413), connected the vault, approved `houserules-cleaner-2.testnet` via **Approve in vault**; it showed *In waiting period*, then *Active* after the 10-minute delay. Found and fixed a stale-status bug on the People page along the way. Everything after the wallet popup (checking the signer is the vault owner, verifying the tx on-chain, the audit row) is already tested, including against a real testnet `add_payee`.

## Hosting: Nov 4

Step-by-step guide: [deploy.md](deploy.md). The production build is already checked locally.

- [ ] **A Postgres `DATABASE_URL`** for production: any standard PostgreSQL 13+ that Vercel can reach (Supabase, Railway, Render, RDS, your own server…). Use the pooled connection string if the provider has one. Locally we don't need one; the app uses PGlite.
- [ ] **A `SESSION_SECRET`** for production. Generate it with `openssl rand -base64 48`, and put both values into **Vercel** env vars, not into chat or the repo.
- [ ] **A Vercel project** linked to the GitHub repo (needs the push first).
- [ ] **Decide:** hosted mainnet straight away, or a hosted testnet preview first. Production refuses mock 1Click, so a testnet deploy can't take guest payments (see the open decision in [deploy.md](deploy.md)).

## Mainnet: Nov 5

**Changed 2026-11-03:** the first real $1 1Click payment moves from recording day to **Nov 5**, so the app is proven on mainnet by Nov 6 and the rest of the week goes to enhancements. On **Nov 13** you still do a rehearsal payment about an hour before recording.

- [ ] **A funded mainnet account**, e.g. `houserules-dev.near`, with about **4 NEAR**: about 2.8 NEAR becomes the vault's contract storage (measured by the preflight script from the 178 KB wasm), plus about 1 NEAR for gas, the agent account and USDC registrations (about 0.001 NEAR each, measured).
- [ ] **Tell me the account name** and I'll run `pnpm --filter web preflight -- --account <it> --payee <owner> --payee <cleaner>`. It's read-only: no keys, no signing.
- [ ] **$2–5 of USDC plus about $1 of ETH on Base** in MetaMask. That's the "guest" paying an invoice from another chain.
- [ ] **About $30 USDC** for the demo, to collect and pay out on camera.
- [ ] **A mainnet owner and cleaner account** (yours or friends', with permission).
- [ ] **A 1Click API key** (optional). Without one, 1Click works but charges **0.2%**. The key goes into `web/.env.local` as `ONECLICK_API_KEY`.
- [ ] **The first real payment also confirms** three settings for live mode: `USDC_ASSET_ID`, `USDC_TOKEN_ACCOUNT` and `INTENTS_SENDERS` (see `web/.env.example`).
- [ ] **Your explicit OK for each mainnet transaction.** I never sign or spend on mainnet without it (CLAUDE.md).

## Enhancements: Nov 7–11 (optional, unblocks backlog items)

- [ ] **A NEAR AI Cloud key** (cloud.near.ai; $10 of credits by joining NEAR Builders). It lets me verify **Polish with NEAR AI** live (backlog item 1). Add `NEAR_AI_API_KEY` and `NEAR_AI_MODEL` to `web/.env.example` by hand; I can't read `.env*` files.

## For live payouts: Nov 5–6

- [ ] **The agent's function-call key in the production server env (Vercel):** `AGENT_ACCOUNT` and `AGENT_PRIVATE_KEY` (the settle-only key). The app checks on-chain that this key can only call `vault.settle` and refuses to run otherwise. Never paste a full-access key there.
- [ ] **For scheduled runs:** add GitHub repo secrets `APP_URL` and `AGENT_RUN_SECRET` (≥32 random chars, the same value as the app's env). The workflow is in `.github/workflows/agent-schedule.yml` and does nothing until both exist. The **Run agent now** button works without them.

## Hackathon admin

- [ ] **Paste the official hackathon rules** (or a link). I'll save them as `HACKATHON.md`; CLAUDE.md points there, and it doesn't exist yet.
- [ ] **The Discord question about pre-hackathon work** (plan §12, still open).
- [ ] **Nomad:** ask them before naming them as a design partner (plan §0). Until then, no Nomad names, data or branding anywhere.
- [ ] **Nov 12:** code freeze. I run the full suites and the agentshield scan, and we dry-run the demo script.
- [ ] **Nov 13:** rehearsal $1 payment about an hour before, then record the demo video. Script, shot list and a draft X post are in [demo-script.md](demo-script.md). Post only when you're happy with it.
- [ ] **Nov 14:** decide on making the repo public. I'll run `npx -y ecc-agentshield scan --path .` first. Submit with tracks `realworld` + `security` + `business`, aiming for 12:00 UTC.

## Optional, makes my work better

- [ ] **Install the Claude skills** CLAUDE.md expects (`hallmark`, `ui-styling`, `emil-design-eng`, `test-driven-development`, …) into `.claude/skills/`, then restart the session. I've been following their intent by hand.
- [ ] **Tell me the GitHub repo URL if it ever changes.** It's embedded in the contract's on-chain metadata (`contracts/vault/Cargo.toml`).

---

## Already done (no action)

- Toolchain: Rust, cargo-near, near-cli, Node and pnpm.
- Testnet accounts created; keys in the Keychain.
- Private repo `TeptepDesu/house-rules`, with pushes so far.
- Database switched to plain Postgres (PGlite locally), so no hosted database is needed for development.
