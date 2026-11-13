# Submission draft

Everything for the hackathon form, except what only Joseph can provide. Rules: [`HACKATHON.md`](../HACKATHON.md). **Read the live copy again before submitting** (https://nearhackathon.com/HACKATHON.md), because rules can change.

There is **one attempt per repository**. Mistakes are fixed by requesting changes, not by submitting again. Send it only once the repository is public and the demo post is up. Deadline: **2026-11-14 23:59 UTC**. Plan for about 12:00 UTC.

## Ready

| Field | Value |
|---|---|
| `projectName` | House Rules |
| `tracks` | `realworld`, `security`, `business` |
| `projectUrl` | https://github.com/TeptepDesu/house-rules (must be public first) |
| `size` | `1` if solo (Joseph confirms) |

**`idea`** (20–2000 characters; this is 1,567, for Joseph to edit and approve):

> Short-term rental operators collect money from guests on many channels, then pay owners and cleaners by hand from spreadsheets, because automating payouts means trusting software with the bank account. House Rules is an autonomous back office that makes that safe. It doesn't replace Airbnb, Booking.com or Agoda: guests still book there, and each platform pays the operator for its own bookings, then stops. House Rules handles what comes after, for every channel, under one set of rules. Operators drop in an Airbnb, Booking.com or PMS payout report (any other CSV by naming its columns once), and bookings are reconciled against what was collected. Guests pay direct bookings and extra charges from any chain through NEAR Intents 1Click, and exact USDC lands in a vault contract on NEAR. A settlement agent then computes each split and pays owners and cleaners in one atomic batch. The agent holds only a NEAR function-call key that can call settle and nothing else, and the vault enforces the operator's rules on-chain: an allowlist, per-payout caps, a daily limit, a waiting period for new payees, and each booking paid once. Stolen-key attacks are refused by the vault or by NEAR itself, and the audit log comes from the vault's own events. It runs live on NEAR testnet (the vault, the scoped agent key, payouts and the stolen-key attacks); the guest's 1Click deposit is simulated in the demo because 1Click has no testnet. It's built for a normal rental business: names and dollars first, chain details one click away. Humans set the rules; NEAR enforces them.

## Only Joseph can provide these

Never guessed or filled in by an agent:

| Field | Note |
|---|---|
| `leadName` | 2–80 characters |
| `email` | Contact email |
| `nearAddress` | **Mainnet** account for the prize payout, e.g. `team.near`. It must exist already. Create it in any NEAR wallet. It only receives the prize; nothing else uses it |
| `demoUrl` | Link to the public X post, once published |
| `consent` | Joseph must agree to this notice, word for word: *"I agree that the organizers may use these details to review our submission and contact us about this hackathon."* |

## How it gets sent

1. Claude builds the JSON payload with a fresh `requestId`, validates every field against the contract in `HACKATHON.md`, and prints it. The payload is **not committed**, because it holds personal data.
2. Joseph reads it and says yes.
3. Claude sends one `POST https://nearhackathon.com/api/applications`. A `201` means it's saved. On a network error or a `503`, retry with the **same** `requestId`. On a `403` or `409`, stop and tell Joseph.

Joseph can use the form at https://nearhackathon.com/#apply instead. The fields are the same.

## Optional track

`privacy` becomes a fair fit only if the NEAR AI rewording is verified live (it needs a key). Until then, don't select it.

## After submitting

- Keep the repository public through judging (Q-014).
- If hosted, keep the demo up until at least Nov 18, ideally Nov 25 (Q-012).
- Any correction goes through https://nearhackathon.com/request-changes.
