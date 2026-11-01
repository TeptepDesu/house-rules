"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/db";
import { applyImport, existingForImport } from "@/lib/db/bookings";
import { listProperties } from "@/lib/db/people";
import { parseCsv } from "@/lib/importers/csv";
import { type ColumnMapping, type ImportRow, detectFormat, mapRows, summarize } from "@/lib/importers";

const MAX_BYTES = 512 * 1024;
const MAX_ROWS = 2_000;

export type PreviewRow = {
  line: number;
  ref: string;
  status: ImportRow["status"];
  reason?: string;
  guestName?: string;
  propertyName?: string;
  checkIn?: string;
  checkOut?: string;
  payout?: string; // raw units as a decimal string (bigint isn't serializable)
};

export type ImportState =
  | { kind: "error"; message: string }
  | { kind: "needs_mapping"; headers: string[] }
  | { kind: "preview"; format: string; counts: ReturnType<typeof summarize>; summaryText: string; rows: PreviewRow[] }
  | { kind: "done"; created: number; updated: number; counts: ReturnType<typeof summarize> }
  | undefined;

const MappingSchema = z.object({
  channel: z.enum(["airbnb", "booking_com", "other"]),
  dateFormat: z.enum(["MDY", "YMD"]),
  columns: z.object({
    externalRef: z.string().min(1),
    checkIn: z.string().min(1),
    checkOut: z.string().min(1),
    guestName: z.string().min(1),
    listing: z.string().min(1),
    payout: z.string().min(1),
  }),
});

type Built =
  | { kind: "error"; error: string }
  | { kind: "needs_mapping"; headers: string[] }
  | { kind: "ok"; mapping: ColumnMapping; mapped: ImportRow[]; properties: { id: string; name: string }[] };

/** Parse + map + compare with the DB, always server-side from the raw file text. */
async function build(userId: string, formData: FormData): Promise<Built> {
  const csv = formData.get("csv");
  if (typeof csv !== "string" || csv.trim() === "") return { kind: "error", error: "Choose a CSV file to import." };
  if (new TextEncoder().encode(csv).length > MAX_BYTES) return { kind: "error", error: "That file is over 512 KB. Split it and import in parts." };
  let rows: string[][];
  try {
    rows = parseCsv(csv);
  } catch {
    return { kind: "error", error: "That doesn't look like a valid CSV file." };
  }
  if (rows.length < 2) return { kind: "error", error: "The file has no rows to import." };
  if (rows.length > MAX_ROWS + 1) return { kind: "error", error: `Import at most ${MAX_ROWS} rows at a time.` };

  const headers = rows[0];
  let mapping: ColumnMapping | null = detectFormat(headers);
  const rawMapping = formData.get("mapping");
  if (!mapping && typeof rawMapping === "string" && rawMapping) {
    const parsed = MappingSchema.safeParse(JSON.parse(rawMapping));
    if (!parsed.success || !Object.values(parsed.data.columns).every((c) => headers.includes(c))) {
      return { kind: "error", error: "Pick a column for every field." };
    }
    mapping = { id: "manual", ...parsed.data };
  }
  if (!mapping) return { kind: "needs_mapping", headers };

  const properties = (await listProperties(userId)).map((p) => ({ id: p.id, name: p.name }));
  const refs = rows.slice(1).map((r) => r[headers.findIndex((h) => h.trim().toLowerCase() === mapping!.columns.externalRef.toLowerCase())] ?? "").filter(Boolean);
  const existing = await existingForImport(userId, mapping.channel, refs);
  const mapped = mapRows(rows, mapping, { properties, existing });
  return { kind: "ok", mapping, mapped, properties };
}

export async function previewImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireUser();
  try {
    const r = await build(user.id, formData);
    if (r.kind === "error") return { kind: "error", message: r.error };
    if (r.kind === "needs_mapping") return { kind: "needs_mapping", headers: r.headers };
    const names = new Map(r.properties.map((p) => [p.id, p.name]));
    const counts = summarize(r.mapped);
    return {
      kind: "preview",
      format: r.mapping.id,
      counts,
      summaryText: `${counts.ok} will match, ${counts.flagged} flagged, ${counts.duplicate} duplicate${counts.duplicate === 1 ? "" : "s"}`,
      rows: r.mapped.map((x) => ({
        line: x.line,
        ref: x.ref,
        status: x.status,
        reason: x.reason,
        guestName: x.booking?.guestName,
        propertyName: x.booking ? names.get(x.booking.propertyId) : undefined,
        checkIn: x.booking?.checkIn,
        checkOut: x.booking?.checkOut,
        payout: x.booking?.payout.toString(),
      })),
    };
  } catch (e) {
    console.error("[import.preview] failed", e);
    return { kind: "error", message: "Couldn't read that file. Try again." };
  }
}

export async function confirmImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const user = await requireUser();
  try {
    const r = await build(user.id, formData); // never trust the preview: recompute from the file
    if (r.kind === "error") return { kind: "error", message: r.error };
    if (r.kind === "needs_mapping") return { kind: "needs_mapping", headers: r.headers };
    const counts = summarize(r.mapped);
    const { created, updated } = await applyImport(user.id, r.mapped, `import:${r.mapping.id}`);
    await logActivity({ userId: user.id, action: "import.confirm", entity: "booking", meta: { format: r.mapping.id, created, updated, ...counts } });
    refresh();
    return { kind: "done", created, updated, counts };
  } catch (e) {
    console.error("[import.confirm] failed", e);
    return { kind: "error", message: "The import didn't go through. Nothing was saved; try again." };
  }
}
