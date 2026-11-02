import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ArrowUpRight, CalendarClock, Gauge, KeyRound, ListChecks, Repeat, ShieldCheck } from "lucide-react";
import { AccountName } from "@/components/account-name";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { requireUser } from "@/lib/auth/dal";
import { getOperatorAccount } from "@/lib/db";
import { VaultControls } from "@/components/rules/vault-controls";
import { formatUsd } from "@/lib/money";
import { explorerAccountUrl, networkId } from "@/lib/near/network";
import { cn } from "@/lib/utils";
import { describeRules } from "@/lib/vault/rules";
import { loadVaultView } from "@/lib/vault/load";

export const metadata: Metadata = { title: "Vault rules · House Rules" };

const ROLE = { owner: "Owner", cleaner: "Cleaner" } as const;

export default function RulesPage() {
  return (
    <>
      <PageHeader title="Vault rules" description="Enforced by your vault on NEAR. The payout agent can't break them, and neither can this server." />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="rules-loading">Reading your vault…</p>}>
        <RulesContent />
      </Suspense>
    </>
  );
}

function RuleCard({
  testid,
  icon: Icon,
  title,
  detail,
  children,
  tone = "default",
}: {
  testid: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  title: string;
  detail?: string;
  children?: React.ReactNode;
  tone?: "default" | "bad";
}) {
  return (
    <section className={cn("rounded-[10px] border bg-card p-4", tone === "bad" && "border-destructive/40")} data-testid={testid}>
      <div className="flex items-start gap-3">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary", tone === "bad" && "bg-destructive-soft text-destructive")}>
          <Icon aria-hidden className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-semibold">{title}</h2>
          {detail && <p className="mt-0.5 text-sm text-muted-foreground">{detail}</p>}
          {children}
        </div>
      </div>
    </section>
  );
}

async function RulesContent() {
  const user = await requireUser();
  const [v, operator] = await Promise.all([loadVaultView(user.id), getOperatorAccount(user.id)]);
  if (v.state === "no_vault") {
    return (
      <EmptyState
        data-testid="rules-no-vault"
        title="No vault connected"
        body="Your vault holds your USDC and enforces these rules on-chain."
        action={
          <Link href="/settings" className="text-sm text-primary underline-offset-4 hover:underline">
            Connect it in Settings
          </Link>
        }
      />
    );
  }
  if (v.state === "unreachable") {
    return (
      <p role="alert" className="rounded-[10px] border px-4 py-3 text-sm text-destructive" data-testid="rules-unreachable">
        {v.message} ({v.vaultAccount})
      </p>
    );
  }
  const r = describeRules(v);
  const network = networkId();
  const when = (ns: bigint) => new Date(Number(ns / 1_000_000n)).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border bg-card px-4 py-3 text-sm" data-testid="rules-vault">
        <div>
          <span className="text-muted-foreground">Vault </span>
          <span className="font-mono">{v.vaultAccount}</span>
          {v.balance !== null && (
            <span className="ml-3">
              holds <Money raw={v.balance} className="font-semibold" />
            </span>
          )}
        </div>
        {v.mode === "live" ? (
          <a href={explorerAccountUrl(v.vaultAccount, network)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-primary underline-offset-4 hover:underline">
            View on-chain <ArrowUpRight aria-hidden className="size-3.5" />
          </a>
        ) : (
          <span className="text-xs text-muted-foreground" data-testid="rules-rehearsal">
            Rehearsal: not on-chain yet
          </span>
        )}
      </div>

      <RuleCard testid="policy-rule-allowlist" icon={ListChecks} title={r.allowlist.title} detail="Anyone else is refused by the vault, whatever the agent asks.">
        {r.allowlist.payees.length > 0 && (
          <ul className="mt-3 divide-y rounded-lg border">
            {r.allowlist.payees.map((p) => (
              <li key={p.accountId} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2" data-testid={`rule-payee-${p.accountId}`}>
                <AccountName name={p.name} role={ROLE[p.role]} account={p.accountId} />
                <div className="flex items-center gap-3 text-sm">
                  <span className="tabular text-muted-foreground">
                    up to <Money raw={p.cap} />
                  </span>
                  <StatusPill kind="payee" status={p.status} />
                  {p.status === "in_delay" && <span className="text-xs text-muted-foreground">payable {when(p.payableFromNs)}</span>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </RuleCard>
      <div className="grid gap-4 md:grid-cols-2">
        <RuleCard testid="policy-rule-cap" icon={Gauge} title={r.cap.title} detail={r.cap.detail} />
        <RuleCard testid="policy-rule-daily-limit" icon={CalendarClock} title={r.daily.title} detail={r.daily.detail} />
        <RuleCard testid="policy-rule-delay" icon={ShieldCheck} title={r.delay.title} detail={r.delay.detail} />
        <RuleCard testid="policy-rule-once" icon={Repeat} title={r.once.title} detail={r.once.detail} />
      </div>
      <RuleCard
        testid="policy-rule-agent-key"
        icon={KeyRound}
        tone={v.agentKey.ok ? "default" : "bad"}
        title={v.agentKey.ok ? "The agent can only call settle" : "The agent key needs attention"}
        detail={v.agentKey.ok ? `${v.agentKey.detail}. It can't withdraw, add payees, or change these rules: those need your wallet.` : v.agentKey.detail}
      />
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border bg-card px-4 py-3" data-testid="vault-controls">
        <div className="min-w-0">
          <h2 className="font-semibold">Your controls</h2>
          <p className="text-sm text-muted-foreground">Only your wallet can change the limits or move money out of the vault.</p>
        </div>
        {v.mode === "live" && operator ? (
          <VaultControls
            dailyLimit={usdInput(v.policy.dailyLimit)}
            delayHours={(v.policy.payeeDelayNs / 3_600_000_000_000n).toString()}
            balance={v.balance !== null ? formatUsd(v.balance) : "your USDC"}
            owner={operator}
          />
        ) : (
          <p className="text-xs text-muted-foreground" data-testid="vault-controls-unavailable">
            {v.mode === "live" ? "Link your NEAR wallet in Settings to use these." : "Rehearsal: these are signed by your wallet on a live vault."}
          </p>
        )}
      </section>
    </div>
  );
}

/** 20_000_000_000n → "20000.00" for an editable input. */
const usdInput = (raw: bigint) => `${raw / 1_000_000n}.${(raw % 1_000_000n).toString().padStart(6, "0").slice(0, 2)}`;
