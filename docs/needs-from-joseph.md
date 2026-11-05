# What's left for Joseph

_Last updated: 2026-11-05._ Everything that doesn't need you is done. Each item below needs your money, your accounts, your face on camera, or your yes.

Deadline: **Nov 14, 23:59 UTC**. Aim to submit around 12:00 UTC.

## Required to submit

1. [x] **Say "push".** Done 2026-11-05. Later commits need your word again; I check the repo is still private first.
2. [ ] **Create the mainnet account for the prize payout** in any NEAR wallet, e.g. `yourname.near`. Only you can create it, and it can also be the operator account below.
3. [ ] **Nov 13: record the 2-minute demo and publish the X post.** The script, shot list and post draft are in [demo-script.md](demo-script.md). A video is required if judges can't open a hosted demo (`HACKATHON.md`, Q-012).
4. [ ] **Nov 14: say "make it public".** I re-run the secret and harness scans first, then you make the repo public.
5. [ ] **Nov 14: give me the last form details and approve the submission.** Your name, email, team size, the payout account, the X post link, and your agreement to the contact notice. Everything else is drafted in [submission.md](submission.md). There's only one attempt, so I print the exact payload and wait for your yes.

## Recommended: prove it on mainnet (by Nov 11)

Not required: testnet is eligible (Q-010). But a real guest payment is the strongest thing to show, and only mainnet can do it, because 1Click has no testnet.

6. [ ] **Fund the wallets by Nov 8.** Exchange withdrawals can be slow.
   - about **4 NEAR** on your mainnet account (about 3 becomes the vault's storage);
   - **$2–5 of USDC plus about $1 of ETH on Base** in MetaMask, to act as the guest;
   - about **$30 of USDC** for the vault to collect and pay out on camera.
7. [ ] **Choose mainnet owner and cleaner accounts** (yours or friends', with their permission) and send me all the account names. I'll run the read-only preflight.
8. [ ] **Run [mainnet-runbook.md](mainnet-runbook.md) with me.** It has every command. You sign from your own terminal and wallet, and I never see your keys. It includes the first real $1 payment and the full payout loop.
9. [ ] **Nov 13: do a $1 rehearsal payment** about an hour before recording.

## Optional

10. [ ] **Host it (by Nov 9).** A hosted demo is a plus (Q-012). Follow [deploy.md](deploy.md): any standard PostgreSQL, plus a Vercel project. Then put the connection string in `web/.env.local` and tell me "run db:migrate". If you do this, keep it up until Nov 18, ideally Nov 25.
11. [ ] **Scheduled payouts** (only if hosted): add the GitHub secrets `APP_URL` and `AGENT_RUN_SECRET`. **Run agent now** works without them.
12. [ ] **A NEAR AI key** from cloud.near.ai (buy credits, or claim $10 by joining NEAR Builders). Set `NEAR_AI_API_KEY` in `web/.env.local` and I'll test **Polish with NEAR AI** live. If it works, the `privacy` track becomes a fair fit.
13. [ ] **A 1Click API key** from partners.near-intents.org. Without one, 1Click charges 0.2%, which is fine at these amounts.
14. [ ] **Add pnpm to your shell:** `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshenv`

## Your call, already decided by default

Tell me if you want any of these changed:

- **Hosted deploy goes straight to mainnet**, not a testnet preview.
- **Stretch goals dropped:** private revenue mode (1Click requires user authentication) and cross-chain owner payouts (they need a contract change).
- **A fully held run reads "Held back"**, not "Failed".
- **No design partner is named** anywhere, so nobody needs asking.
- **The demo's new-payee wait is 10 minutes** on mainnet. Say so on camera; production would use 24 hours.
