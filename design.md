# House Rules — design system

**One line:** a bank statement you can trust, with a rulebook beside it. Calm, exact, slightly formal. **Fintech, not crypto.**

Judges decide in the first five seconds whether a normal rental business could use this tomorrow (plan §3). Every screen should read like accounting software that happens to settle on NEAR, not like a wallet.

Structure references (patterns only, never their branding):
- Stripe Dashboard: overview, payments list, payout detail, events log, and the test-mode banner.
- Stripe hosted invoice: the guest pay page.
- Ramp spend controls: vault rules as plain-language cards.

---

## Principles

1. **Names before addresses.** "Maria Santos · Cleaner", with `maria.testnet` in small mono underneath. Never lead with an account ID.
2. **Dollars before tokens.** Show `$1,234.56`. Say "USDC" only where it changes a decision, such as on the pay page and in the vault balance's fine print.
3. **Hashes stay hidden.** Transaction hashes sit behind a **View on-chain ↗** link; the full hash appears only in the audit log detail.
4. **Every rule is a sentence.** "Pays only these 6 people", "At most $800 per payout", "Up to $3,000 per day", "New payees wait 24 hours".
5. **Show why, not just what.** A blocked booking always carries its reason ("Open damage claim: $200.00 unpaid") and the next action.
6. **Quiet by default, loud only for money at risk.** Colour is for status; the one accent marks primary actions.

**Never:** neon, gradients, glows, glassmorphism, coin icons, rocket or moon imagery, "Web3" wording, wallet-address soup on main screens, or long hex strings in tables.

---

## Colour

There's a warm neutral base (stone), one accent ("ledger green", a deep teal-green) and four muted status colours. All tokens live in `web/app/globals.css` as OKLCH; components use the semantic names below, never raw values. **This palette is ours; don't reuse the Nomad Payment Portal's tokens.**

| Token | Use |
|---|---|
| `--background` / `--foreground` | Page and body text (warm off-white / near-black) |
| `--card`, `--muted`, `--border` | Surfaces, quiet fills, hairlines |
| `--primary` | **Accent:** ledger green. Primary buttons, active nav item, focus ring. Max one primary button per view |
| `--success` | Paid, settled, active payee, matched |
| `--warning` | Pending, in delay, awaiting, testnet banner |
| `--destructive` | Blocked, rejected, failed, underpaid |
| `--info` | Neutral states: open, unreconciled, imported |

Each status token has a `-soft` partner for pill backgrounds. Text on a soft background uses the strong token, and every pair passes WCAG AA.

## Type

- **IBM Plex Sans** for the interface (`--font-sans`) and **IBM Plex Mono** for account IDs, hashes and keys (`--font-mono`). Both are loaded with `next/font`.
- **All money uses `tabular-nums`**, so columns line up like a statement. Amounts are right-aligned in tables.

| Role | Size / weight |
|---|---|
| Page title | 22px / 600 |
| Section title | 15px / 600 |
| Body / table | 14px / 400 |
| Meta, account ID | 12px / 400, muted (mono for IDs) |
| Metric value | 28px / 600, tabular |

## Space and shape

- A 4px grid. Page padding is 24px and gaps between cards are 16px. Table rows are 44px tall, which is dense but tappable.
- Radius: 10px for cards and dialogs, 8px for inputs and buttons, full for pills.
- Hairline borders, no drop shadows on cards. Shadows are reserved for popovers and dialogs.

## Layout

- **App shell:** a 232px left sidebar (Overview, Bookings, Invoices, Payouts, People & properties, Vault rules, Audit log, Import) plus content up to 1120px wide. On narrow screens the sidebar collapses to a top bar with a menu.
- **Network banner** (like Stripe's test mode): a thin full-width amber bar on testnet, "Test mode · NEAR testnet · mock USDC". On mainnet the bar is absent and the footer reads "Live · NEAR mainnet". It's never subtle on testnet.
- **The guest pay page has no app chrome.** It shows a centred 440px column: who is charging and what for, the amount, one big action, then the asset picker, QR code and live status.

## Components (in `web/components/`)

| Component | Contract |
|---|---|
| `Money` | `raw: bigint`; renders `formatUsd`, tabular; `exact` prop for full precision |
| `AccountName` | Name and role on top, `account_id` in small mono below, optional copy button |
| `StatusPill` | `status` → label + token colour from one map; `data-testid` passed through |
| `TxLink` | "View on-chain ↗" to the explorer for the current network; never shows the hash inline |
| `PageHeader` | Title, one-line description, optional single primary action |
| `MetricCard` | Label, `Money` or count, one-line context ("3 bookings ready") |
| `RuleCard` | A vault rule in one sentence plus its value and the on-chain source ("from vault policy") |
| `EmptyState` | What this is, why it's empty, and one action |

**Statuses:** one map, `web/lib/ui/status.ts`, turns every enum (payee, booking settlement, invoice, payment, split, run) into a label and tone. A tone isn't chosen per screen.

## Motion

Next to none, because this is a finance tool. Allowed: 150ms opacity/colour transitions, the dialog fade, and a pulsing dot for "waiting for deposit". Everything respects `prefers-reduced-motion`. Nothing bounces.

## Writing

- Plain words: "Pay out", "Blocked", "Waiting for payment", "Paid". Not "Execute", "Tx", or "Broadcast".
- Dates as "Nov 6, 2026"; times in the operator's local zone with the zone shown.
- Errors say what happened and what to do: "Maria isn't registered for USDC yet. Add her again to register." Never a stack trace or a raw RPC error.

## Testability

Every interactive element, row, card, dialog, toast and state (empty, loading, error, pending, confirmed, rejected) gets a `data-testid` following CLAUDE.md: `<feature>-<element>[-<qualifier>]`, with business keys rather than indexes.
