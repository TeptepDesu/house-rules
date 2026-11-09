import type { Metadata } from "next";
import { Suspense } from "react";
import { AccountName } from "@/components/account-name";
import { EmptyState } from "@/components/empty-state";
import { Money } from "@/components/money";
import { PageHeader } from "@/components/page-header";
import { PropertyCover } from "@/components/property-cover";
import { ApprovePayee } from "@/components/people/approve-payee";
import { EditPropertyPeople } from "@/components/people/edit-property-people";
import { ManagePayee } from "@/components/people/manage-payee";
import { StatementLink } from "@/components/people/statement-link";
import { PayeeForm } from "@/components/people/payee-form";
import { PropertyForm } from "@/components/people/property-form";
import { StatusPill } from "@/components/status-pill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireUser } from "@/lib/auth/dal";
import { listPayees, listProperties } from "@/lib/db/people";
import { formatBps, usdInput } from "@/lib/money";
import { networkId } from "@/lib/near/network";
import { agentMode } from "@/lib/agent/vault-factory";
import { getVaultAccount } from "@/lib/db/invoices";
import { refreshWaitingPayees } from "@/lib/vault/load";

export const metadata: Metadata = { title: "Homes & people · House Rules" };

const ROLE = { owner: "Owner", cleaner: "Cleaner" } as const;
/** 800_000_000n → "800.00" for an editable input (display elsewhere goes through formatUsd). */
export default function PeoplePage() {
  return (
    <>
      <PageHeader title="Homes & people" description="Who the vault may pay, how much at most, and which property each payout belongs to." />
      <Suspense fallback={<p className="text-sm text-muted-foreground" data-testid="people-loading">Loading…</p>}>
        <PeopleContent />
      </Suspense>
    </>
  );
}

async function PeopleContent() {
  const user = await requireUser();
  await refreshWaitingPayees(user.id);
  const [payees, properties, vault] = await Promise.all([listPayees(user.id), listProperties(user.id), getVaultAccount(user.id)]);
  const rehearsal = agentMode() === "mock";
  const owners = payees.filter((p) => p.role === "owner" && p.vaultStatus !== "removed");
  const cleaners = payees.filter((p) => p.role === "cleaner" && p.vaultStatus !== "removed");

  return (
    <div className="grid gap-10">
      <section aria-labelledby="payees-title" className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h2 id="payees-title" className="mb-3 text-[20px] font-bold tracking-tight">
            Payees
          </h2>
          {payees.length === 0 ? (
            <EmptyState
              data-testid="payees-empty"
              title="No payees yet"
              body="Add the owners and cleaners you pay. The vault will only ever pay people on this list, up to their limit."
            />
          ) : (
            <div className="rounded-2xl border">
              <Table data-testid="payees-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Payee</TableHead>
                    <TableHead className="hidden sm:table-cell">Role</TableHead>
                    <TableHead className="text-right">Max per payout</TableHead>
                    <TableHead className="hidden sm:table-cell">Vault</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {payees.map((p) => (
                    <TableRow key={p.id} data-testid={`payee-row-${p.id}`}>
                      <TableCell>
                        <AccountName name={p.name} account={p.nearAccount} />
                        {/* small screens: role + status fold under the name */}
                        <div className="mt-1.5 flex items-center gap-2 sm:hidden">
                          <span className="text-xs text-muted-foreground">{ROLE[p.role]}</span>
                          <StatusPill kind="payee" status={p.vaultStatus} />
                        </div>
                        {/* actions at every size (the Vault column is hidden on small screens) */}
                        {p.vaultStatus !== "removed" && (
                          <div className="mt-2 flex flex-wrap items-start gap-2">
                            {p.vaultStatus === "pending_signature" && vault && <ApprovePayee payeeId={p.id} rehearsal={rehearsal} />}
                            <ManagePayee payeeId={p.id} name={p.name} account={p.nearAccount} cap={usdInput(p.capRaw)} onVault={p.vaultStatus !== "pending_signature"} rehearsal={rehearsal} />
                            <StatementLink payeeId={p.id} />
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">{ROLE[p.role]}</TableCell>
                      <TableCell className="text-right align-top sm:align-middle">
                        <Money raw={p.capRaw} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="grid justify-items-start gap-1.5">
                          <StatusPill kind="payee" status={p.vaultStatus} data-testid={`payee-status-${p.id}`} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Add a payee</h3>
          <PayeeForm network={networkId()} />
        </div>
      </section>

      <section aria-labelledby="properties-title" className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="min-w-0">
          <h2 id="properties-title" className="mb-3 text-[20px] font-bold tracking-tight">
            Properties
          </h2>
          {properties.length === 0 ? (
            <EmptyState
              data-testid="properties-empty"
              title="No properties yet"
              body="Each property sets who gets paid for a stay: the cleaner's flat fee, your management %, and the owner gets the rest."
            />
          ) : (
            <div className="rounded-2xl border">
              <Table data-testid="properties-table">
                <TableHeader>
                  <TableRow>
                    <TableHead>Property</TableHead>
                    <TableHead className="hidden md:table-cell">Owner</TableHead>
                    <TableHead className="hidden md:table-cell">Cleaner</TableHead>
                    <TableHead className="text-right">Cleaning</TableHead>
                    <TableHead className="text-right">Mgmt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {properties.map((p) => (
                    <TableRow key={p.id} data-testid={`property-row-${p.id}`}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <PropertyCover name={p.name} className="h-12 w-[72px] shrink-0 rounded-xl" />
                          <div className="font-heading text-[15px] font-bold tracking-tight">{p.name}</div>
                        </div>
                        <div className="mt-2 text-xs text-muted-foreground md:hidden">
                          Owner: {p.ownerName ?? "not set"} · Cleaner: {p.cleanerName ?? "not set"}
                        </div>
                        <div className="mt-2">
                          <EditPropertyPeople
                            propertyId={p.id}
                            name={p.name}
                            ownerId={p.ownerPayeeId}
                            cleanerId={p.cleanerPayeeId}
                            owners={owners.map(({ id, name }) => ({ id, name }))}
                            cleaners={cleaners.map(({ id, name }) => ({ id, name }))}
                          />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {p.ownerName && p.ownerAccount ? <AccountName name={p.ownerName} account={p.ownerAccount} /> : <Unset />}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {p.cleanerName && p.cleanerAccount ? <AccountName name={p.cleanerName} account={p.cleanerAccount} /> : <Unset />}
                      </TableCell>
                      <TableCell className="text-right">
                        <Money raw={p.cleaningFeeRaw} />
                      </TableCell>
                      <TableCell className="tabular text-right">{formatBps(p.mgmtFeeBps)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
        <div className="rounded-2xl border bg-card p-4">
          <h3 className="mb-3 text-sm font-semibold">Add a property</h3>
          <PropertyForm owners={owners.map(({ id, name }) => ({ id, name }))} cleaners={cleaners.map(({ id, name }) => ({ id, name }))} />
        </div>
      </section>
    </div>
  );
}

function Unset() {
  return <span className="text-muted-foreground">Not set</span>;
}
