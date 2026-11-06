"use client";

import Link from "next/link";
import { startTransition, useActionState, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { type ImportState, confirmImport, previewImport } from "@/app/(dashboard)/import/actions";
import { Money } from "@/components/money";
import { StatusPill } from "@/components/status-pill";
import { Button, buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FLAG_LABEL, FORMAT_LABEL } from "@/lib/importers/labels";
import type { FlagReason } from "@/lib/importers";
import { stayRange } from "@/lib/ui/format";
import { cn } from "@/lib/utils";

const FIELDS = [
  ["externalRef", "Booking reference"],
  ["guestName", "Guest"],
  ["listing", "Listing / property"],
  ["checkIn", "Check-in"],
  ["checkOut", "Check-out"],
  ["payout", "Payout (USD)"],
] as const;

export function ImportFlow() {
  const [preview, runPreview, previewing] = useActionState<ImportState, FormData>(previewImport, undefined);
  const [result, runConfirm, confirming] = useActionState<ImportState, FormData>(confirmImport, undefined);
  const [csv, setCsv] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [mapping, setMapping] = useState<string>("");
  const [dragging, setDragging] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const send = (action: (f: FormData) => void, text: string, map = mapping) => {
    const fd = new FormData();
    fd.set("csv", text);
    if (map) fd.set("mapping", map);
    startTransition(() => action(fd));
  };

  async function load(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setCsv(text);
    setFileName(file.name);
    setMapping("");
    send(runPreview, text, "");
  }

  const done = result?.kind === "done" ? result : null;
  const state = done ? undefined : result?.kind === "error" ? result : preview;

  if (done) {
    return (
      <div className="max-w-xl rounded-2xl border bg-card p-5" data-testid="import-done">
        <p className="font-medium">Import complete</p>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="import-done-summary">
          {done.created} booking{done.created === 1 ? "" : "s"} added
          {done.updated > 0 && `, ${done.updated} updated`}. {done.counts.flagged > 0 && `${done.counts.flagged} row${done.counts.flagged === 1 ? "" : "s"} still need attention in the file.`}
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/bookings" className={buttonVariants()} data-testid="import-done-bookings">
            Review bookings
          </Link>
          <Button variant="outline" onClick={() => location.reload()} data-testid="import-again">
            Import another file
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6">
      {/* a real <label> for a real (visually hidden) file input: accessible name = visible text,
          keyboard focus on the input shows on the zone, and drag-and-drop still works */}
      <label
        htmlFor="import-file"
        data-testid="import-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          load(e.dataTransfer.files[0]);
        }}
        className={cn(
          "flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed px-6 py-10 text-center transition-colors has-[:focus-visible]:border-ring has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50",
          dragging ? "border-primary bg-primary/5" : "hover:bg-muted/50",
        )}
      >
        <FileUp aria-hidden className="size-6 text-muted-foreground" />
        <span className="font-medium">{fileName ?? "Drop a payout report here, or click to choose"}</span>
        <span className="text-sm text-muted-foreground">Airbnb, Booking.com and Guesty exports are detected automatically. CSV, up to 512 KB.</span>
        <input
          ref={input}
          id="import-file"
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          data-testid="import-file-input"
          onChange={(e) => load(e.target.files?.[0])}
        />
      </label>

      {previewing && (
        <p className="text-sm text-muted-foreground" data-testid="import-loading">
          Reading the file…
        </p>
      )}

      {!previewing && state?.kind === "error" && (
        <p role="alert" className="text-sm text-destructive" data-testid="import-error">
          {state.message}
        </p>
      )}

      {!previewing && state?.kind === "needs_mapping" && csv && (
        <MappingForm headers={state.headers} onSubmit={(m) => (setMapping(m), send(runPreview, csv, m))} />
      )}

      {!previewing && state?.kind === "preview" && csv && (
        <section aria-labelledby="preview-title" className="grid gap-4" data-testid="import-preview">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground" data-testid="import-format">
                {FORMAT_LABEL[state.format] ?? state.format}
              </p>
              <h2 id="preview-title" className="text-[20px] font-bold tracking-tight" data-testid="import-preview-summary">
                {state.summaryText}
              </h2>
            </div>
            <Button disabled={confirming || state.counts.ok === 0} onClick={() => send(runConfirm, csv)} data-testid="import-confirm">
              {confirming ? "Importing…" : state.counts.ok === 0 ? "Nothing new to import" : `Import ${state.counts.ok} booking${state.counts.ok === 1 ? "" : "s"}`}
            </Button>
          </div>
          <div className="overflow-hidden rounded-2xl border">
            <Table data-testid="import-preview-table">
              <TableHeader>
                <TableRow>
                  <TableHead>Row</TableHead>
                  <TableHead>Booking</TableHead>
                  <TableHead className="hidden md:table-cell">Property</TableHead>
                  <TableHead className="hidden sm:table-cell">Stay</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {state.rows
                  .filter((r) => r.status !== "ignored")
                  .map((r) => (
                    <TableRow key={r.line} data-testid={`import-row-${r.line}`} data-status={r.status}>
                      <TableCell className="align-top">
                        <StatusPill kind="importRow" status={r.status} />
                        {r.reason && <p className="mt-1 max-w-[220px] text-xs text-destructive">{FLAG_LABEL[r.reason as FlagReason] ?? r.reason}</p>}
                      </TableCell>
                      <TableCell className="align-top">
                        <div className="font-medium">{r.guestName ?? "—"}</div>
                        <div className="font-mono text-xs text-muted-foreground">
                          {r.ref || `line ${r.line}`}
                        </div>
                      </TableCell>
                      <TableCell className="hidden align-top md:table-cell">{r.propertyName ?? "—"}</TableCell>
                      <TableCell className="tabular hidden align-top whitespace-nowrap sm:table-cell">{r.checkIn && r.checkOut ? stayRange(r.checkIn, r.checkOut) : "—"}</TableCell>
                      <TableCell className="text-right align-top">{r.payout ? <Money raw={BigInt(r.payout)} /> : "—"}</TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </div>
          {state.counts.ignored > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="import-ignored-note">
              {state.counts.ignored} row{state.counts.ignored === 1 ? "" : "s"} skipped: payout summaries, adjustments or cancellations.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

function MappingForm({ headers, onSubmit }: { headers: string[]; onSubmit: (mappingJson: string) => void }) {
  return (
    <form
      className="grid max-w-xl gap-3 rounded-2xl border bg-card p-4"
      data-testid="import-mapping-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        const columns = Object.fromEntries(FIELDS.map(([k]) => [k, String(f.get(k) ?? "")]));
        onSubmit(JSON.stringify({ channel: f.get("channel"), dateFormat: f.get("dateFormat"), columns }));
      }}
    >
      <div>
        <p className="font-medium">{"We don't recognize this format"}</p>
        <p className="text-sm text-muted-foreground">Tell us which column is which. Amounts must be in USD.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([key, label]) => (
          <div key={key} className="grid gap-1.5">
            <Label htmlFor={`map-${key}`}>{label}</Label>
            <NativeSelect id={`map-${key}`} name={key} required defaultValue="" data-testid={`import-map-${key}`}>
              <option value="" disabled>
                Choose a column
              </option>
              {headers.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </NativeSelect>
          </div>
        ))}
        <div className="grid gap-1.5">
          <Label htmlFor="map-dateFormat">Date format</Label>
          <NativeSelect id="map-dateFormat" name="dateFormat" defaultValue="YMD" data-testid="import-map-dateFormat">
            <option value="YMD">2026-10-31</option>
            <option value="MDY">10/31/2026</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="map-channel">Channel</Label>
          <NativeSelect id="map-channel" name="channel" defaultValue="other" data-testid="import-map-channel">
            <option value="airbnb">Airbnb</option>
            <option value="booking_com">Booking.com</option>
            <option value="other">Other</option>
          </NativeSelect>
        </div>
      </div>
      <Button type="submit" className="justify-self-start" data-testid="import-mapping-submit">
        Preview with these columns
      </Button>
    </form>
  );
}
