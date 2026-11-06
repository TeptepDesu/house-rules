# House Rules — design system

**One line:** the homes you run, with a rulebook that holds. Warm and easy to use like a travel app, exact like a bank statement. **Fintech, not crypto.**

Judges decide in the first five seconds whether a normal rental business could use this tomorrow (plan §3). A rental operator thinks in homes and stays, so the product leads with them: every screen should feel like a place you run, with the money beside it.

References (patterns only, never their branding, logo, type or tokens; decided 2026-11-06, replacing the earlier Stripe/Ramp direction):
- Airbnb app: homes as picture-first cards, an icon-over-label tab strip, a phone bottom tab bar, big soft corners, pill controls, stacked sign-in fields.
- NEAR HACKATHON site: cream and saturated blue, heavy tight headlines, small mono caps labels, dot-matrix graphics, the ✳ strip.

---

## Principles

1. **Names before addresses.** "Maria Santos · Cleaner", with `maria.testnet` in small mono underneath. Never lead with an account ID.
2. **Dollars before tokens.** Show `$1,234.56`. Say "USDC" only where it changes a decision, such as on the pay page and in the vault balance's fine print.
3. **Hashes stay hidden.** Transaction hashes sit behind a **View on-chain ↗** link; the full hash appears only in the audit log detail.
4. **Every rule is a sentence.** "Pays only these 6 people", "At most $800 per payout", "Up to $3,000 per day", "New payees wait 24 hours".
5. **Show why, not just what.** A blocked booking always carries its reason ("Open damage claim: $200.00 unpaid") and the next action.
6. **Quiet by default, loud only for money at risk.** Colour is for status; the one accent marks primary actions.

**Never:** neon, gradients, glows, glassmorphism, coin icons, rocket or moon imagery, "Web3" wording, wallet-address soup on main screens, long hex strings in tables, or anyone else's logo or brand colour (no coral).

---

## Colour

There are two themes, both behind the same semantic tokens. All tokens live in `web/app/globals.css` as OKLCH; components use the semantic names below, never raw values. **Never reuse another company's design system or tokens.**

- **Dark (the default, `.dark` on `<html>`):** neutrals and the blue accent follow the NEAR HACKATHON site's dark theme (decided 2026-11-03): green-black background `#161a15`, cream text `#e7dfca`, olive borders, accent blue `#0091fd` with dark text on it. The status colours are ours, tuned for that base.
- **Light (`:root`):** cream `#efe8d9`, near-black text and signal blue `#0a5bcc`, in the spirit of the hackathon site's light theme, with status colours tuned for cream.
- **Brand panel (`--brand-panel`):** the one saturated blue surface, the same in both themes: the sign-in showcase and the Overview number band. At most one per page.
- **Switching:** the sun/moon button (top bar, phone menu, sign-in pages) stores the choice in `localStorage` (`hr-theme`). An inline script in `<head>` applies it before first paint (`web/lib/ui/theme.ts`). The guest pay page has no toggle; it follows the browser's saved choice. The QR code always sits on white so it scans.
- `e2e/a11y.spec.ts` runs axe on the main screens in both themes.

| Token | Use |
|---|---|
| `--background` / `--foreground` | Page and body text (dark: green-black / cream; light: warm off-white / near-black) |
| `--card`, `--muted`, `--border` | Surfaces, quiet fills, hairlines |
| `--primary` | **Accent** (blue in both themes). Primary buttons, active tab icon, focus ring. Max one primary button per view |
| `--shadow-soft`, `--shadow-lift` | Resting cards; hover on home cards, the guest pay card, dialogs |
| `--success` | Paid, settled, active payee, matched |
| `--warning` | Pending, in delay, awaiting, testnet banner |
| `--destructive` | Blocked, rejected, failed, underpaid |
| `--info` | Neutral states: open, unreconciled, imported |

Each status token has a `-soft` partner for pill backgrounds. Text on a soft background uses the strong token, and every pair passes WCAG AA.

## Type

- **Bricolage Grotesque** for headlines and big numbers (`--font-heading`), **Figtree** for the interface (`--font-sans`), **IBM Plex Mono** for account IDs, hashes and the small caps labels (`--font-mono`). All loaded with `next/font`.
- **All money uses `tabular-nums`**, so columns line up like a statement. Amounts are right-aligned in tables.

| Role | Size / weight |
|---|---|
| Sign-in headline | 44–84px / 800, caps, tight |
| Page title | 30–38px / 800, tight |
| Section title | 20px / 700 |
| Metric value | 25–34px / 700, tabular |
| Body / table | 14px / 400 |
| `.label-caps` (table heads, metric labels, banners) | 11px mono, caps, tracked |
| Meta, account ID | 12px / 400, muted (mono for IDs) |

## Space and shape

- A 4px grid. Sections on a page sit 40px apart; cards 16–20px apart.
- Radius: `rounded-2xl` for cards and tables, `rounded-3xl` for the number band and pay card, `rounded-xl` for inputs, full for buttons and pills.
- Controls are comfortable: inputs 44px, buttons 40px (48px for a page's main action).
- Cards have a hairline border and `--shadow-soft`. Home cards have no border: the picture is the card.

## Home covers

Operators rarely have photos, and a home is the product, so each one gets an original dot-matrix picture: `PropertyCover`, from `web/lib/ui/cover.ts`. The scene comes from words in the name ("Loft", "Cottage", "Seaside") and the colour from a hash, so a home keeps its picture forever. Covers are decorative (`aria-hidden`), and the name is always real text beside them. Cover colours are the one palette outside the tokens, since they're art.

## Layout

- **App shell:** a sticky top bar with the wordmark, the nine icon-over-label tabs (underlined when active) and the signed-in operator. Content is centred, up to 1240px wide.
- **Phones:** the top bar shrinks to the wordmark and **Menu** (every page, theme and sign out), and a fixed bottom tab bar holds the five everyday screens.
- **Network banner:** a thin full-width amber bar on testnet, "Test mode · NEAR testnet · mock USDC". On mainnet it's absent. It's never subtle on testnet.
- **Sign-in:** a split screen, with the blue showcase on the left and stacked fields that read as one control on the right. Showcase copy must stay true: no invented customers or numbers.
- **The guest pay page has no app chrome.** A centred 460px card: the home's cover, who is charging and what for, the amount, one big action, then the asset picker, QR code and live status.

## Components (in `web/components/`)

| Component | Contract |
|---|---|
| `Money` | `raw: bigint`; renders `formatUsd`, tabular; `exact` prop for full precision |
| `AccountName` | Name and role on top, `account_id` in small mono below, optional copy button |
| `StatusPill` | `status` → label + token colour from one map; `data-testid` passed through |
| `TxLink` | "View on-chain ↗" to the explorer for the current network; never shows the hash inline |
| `PageHeader` | Title, one-line description, optional single primary action |
| `MetricCard` | Label, `Money` or count, one-line context ("3 bookings ready"). `band` inside `MetricBand` for the blue panel |
| `HomeCard` | Cover, name, owner and cleaner, collected, stays |
| `PropertyCover` | A home's dot-matrix picture, by name |
| `Wordmark`, `BrandMark` | Our own pixel house. Never another company's mark |
| `RuleCard` | A vault rule in one sentence plus its value and the on-chain source ("from vault policy") |
| `EmptyState` | What this is, why it's empty, and one action |

**Statuses:** one map, `web/lib/ui/status.ts`, turns every enum (payee, booking settlement, invoice, payment, split, run) into a label and tone. A tone isn't chosen per screen.

## Motion

Little, because this handles money. Allowed: 150ms opacity/colour/shadow transitions, the dialog fade, a pulsing dot for "waiting for deposit", and the slow strip on the sign-in page. Everything respects `prefers-reduced-motion`. Nothing bounces.

## Writing

- Plain words: "Pay out", "Blocked", "Waiting for payment", "Paid". Not "Execute", "Tx", or "Broadcast".
- Dates as "Nov 6, 2026"; times in the operator's local zone with the zone shown.
- Errors say what happened and what to do: "Maria isn't registered for USDC yet. Add her again to register." Never a stack trace or a raw RPC error.

## Testability

Every interactive element, row, card, dialog, toast and state (empty, loading, error, pending, confirmed, rejected) gets a `data-testid` following CLAUDE.md: `<feature>-<element>[-<qualifier>]`, with business keys rather than indexes.
