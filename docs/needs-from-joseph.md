# What's left for Joseph

_Last updated: 2026-11-09._ Everything that doesn't need you is done. Each item below needs your money, your accounts, your face on camera, or your yes.

Deadline: **Nov 14, 23:59 UTC**. Aim to submit around 12:00 UTC.

## Required to submit

1. [x] **Say "push".** Done 2026-11-05. Later commits need your word again; I check the repo is still private first.
2. [ ] **Create a NEAR mainnet account for the prize payout** in any NEAR wallet, e.g. `yourname.near`. The submission form requires a mainnet account and it must already exist. Some wallets create one for free; others ask for a little NEAR. Nothing else goes in it.
3. [ ] **Nov 13: record the 2-minute demo and publish the X post.** The script, shot list and post draft are in [demo-script.md](demo-script.md). A video is required if judges can't open a hosted demo (`HACKATHON.md`, Q-012).
4. [ ] **Nov 14: say "make it public".** I re-run the secret and harness scans first, then you make the repo public.
5. [ ] **Nov 14: give me the last form details and approve the submission.** Your name, email, team size, the payout account, the X post link, and your agreement to the contact notice. Everything else is drafted in [submission.md](submission.md). There's only one attempt, so I print the exact payload and wait for your yes.

## Dropped: mainnet

Your decision on 2026-11-09: no mainnet in this submission. Testnet is eligible in every track (Q-010). So there are **no wallets to fund**, no mainnet runbook and no real $1 payment. The guest's deposit stays simulated in the demo (1Click has no testnet), and the README says so.

## Optional

10. ~~**Host it.**~~ Not planned: a production deploy refuses rehearsal mode, so it would have to run on mainnet. Hosting is only a plus (Q-012).
11. ~~**Scheduled payouts**~~ Only relevant to a hosted deploy.
12. [ ] **A NEAR AI key** from cloud.near.ai (buy credits, or claim $10 by joining NEAR Builders). Set `NEAR_AI_API_KEY` **and** `NEAR_AI_MODEL` in `web/.env.local` (the feature stays off unless both are set) and I'll test **Polish with NEAR AI** live. If it works, the `privacy` track becomes a fair fit.
13. ~~**A 1Click API key**~~ Not needed without mainnet.
14. [ ] **Add pnpm to your shell:** `echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshenv`

## Your call, already decided by default

Tell me if you want any of these changed:

- **Stretch goals dropped:** private revenue mode (1Click requires user authentication) and cross-chain owner payouts (they need a contract change).
- **A fully held run reads "Held back"**, not "Failed".
- **No design partner is named** anywhere, so nobody needs asking.
