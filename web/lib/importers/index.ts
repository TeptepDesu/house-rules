// Smart import (plan §6D): detect the export format from its headers, map rows to bookings,
// and preview ("22 will match, 2 flagged, 1 duplicate") before anything is written.
// Every built-in format is just a ColumnMapping; the manual fallback uses the same pipeline.
// Header sets are modelled on each channel's export style; fixtures are synthetic.

import { parseUsd } from "@/lib/money";
import { parseCsv } from "./csv";

export type Channel = "airbnb" | "booking_com" | "other";

export type ColumnMapping = {
  id: string;
  channel: Channel;
  dateFormat: "MDY" | "YMD";
  columns: {
    externalRef: string;
    checkIn: string;
    checkOut: string;
    guestName: string;
    listing: string;
    payout: string;
    currency?: string;
    gross?: string;
    fee?: string;
    cleaningFee?: string;
  };
  /** Rows not matching are "ignored" (payout summaries, adjustments, cancellations). */
  rowFilter?: { column: string; include?: string[]; exclude?: string[] };
};

export const FORMATS: ColumnMapping[] = [
  {
    id: "airbnb",
    channel: "airbnb",
    dateFormat: "MDY",
    columns: {
      externalRef: "Confirmation Code",
      checkIn: "Start Date",
      checkOut: "End Date",
      guestName: "Guest",
      listing: "Listing",
      payout: "Amount",
      currency: "Currency",
      gross: "Gross Earnings",
      fee: "Service Fee",
      cleaningFee: "Cleaning Fee",
    },
    rowFilter: { column: "Type", include: ["reservation"] },
  },
  {
    id: "booking_com",
    channel: "booking_com",
    dateFormat: "YMD",
    columns: {
      externalRef: "Reservation number",
      checkIn: "Check-in",
      checkOut: "Check-out",
      guestName: "Guest name",
      listing: "Property name",
      payout: "Payout amount",
      currency: "Currency",
    },
    rowFilter: { column: "Status", exclude: ["cancelled", "canceled", "no_show"] },
  },
  {
    id: "guesty",
    channel: "other",
    dateFormat: "YMD",
    columns: {
      externalRef: "Confirmation Code",
      checkIn: "Check-In",
      checkOut: "Check-Out",
      guestName: "Guest Name",
      listing: "Listing Nickname",
      payout: "Host Payout",
      currency: "Currency",
    },
  },
];

export type ImportedBooking = {
  channel: Channel;
  externalRef: string;
  guestName: string;
  propertyId: string;
  checkIn: string; // YYYY-MM-DD
  checkOut: string;
  payout: bigint;
  /** What the channel should have paid (gross − channel fee when the report has both), else payout. */
  expectedNet: bigint;
  cleaningFee?: bigint;
};

export type FlagReason =
  | "non_usd"
  | "invalid_date"
  | "invalid_amount"
  | "missing_ref"
  | "unknown_listing"
  | "conflicting_duplicate"
  | "payout_changed";

export type ImportRow = {
  line: number;
  ref: string;
  status: "new" | "update" | "duplicate" | "flagged" | "ignored";
  reason?: FlagReason;
  booking?: ImportedBooking;
};

export type ImportContext = {
  properties: { id: string; name: string }[];
  /** Already-known bookings by "<channel>:<externalRef>". */
  existing: Map<string, { otaPayout?: bigint }>;
};

const norm = (h: string) => h.trim().toLowerCase().replace(/\s+/g, " ");

export function detectFormat(headers: string[]): ColumnMapping | null {
  const have = new Set(headers.map(norm));
  const fits = FORMATS.filter((f) => [...Object.values(f.columns), f.rowFilter?.column].filter(Boolean).every((c) => have.has(norm(c!))));
  fits.sort((a, b) => Object.keys(b.columns).length - Object.keys(a.columns).length);
  return fits[0] ?? null;
}

function parseDate(s: string, fmt: "MDY" | "YMD"): string | null {
  const m = fmt === "MDY" ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s.trim()) : /^(\d{4})-(\d{2})-(\d{2})/.exec(s.trim());
  if (!m) return null;
  const [y, mo, d] = fmt === "MDY" ? [+m[3], +m[1], +m[2]] : [+m[1], +m[2], +m[3]];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

const amount = (s: string | undefined): bigint | null => {
  if (s === undefined || s.trim() === "") return null;
  try {
    return parseUsd(s);
  } catch {
    return null;
  }
};

export function mapRows(rows: string[][], m: ColumnMapping, ctx: ImportContext): ImportRow[] {
  const [header, ...data] = rows;
  const idx = new Map(header.map((h, i) => [norm(h), i]));
  const props = new Map(ctx.properties.map((p) => [norm(p.name), p.id]));

  const parsed: ImportRow[] = data.map((cells, i) => {
    const get = (col?: string) => (col === undefined ? undefined : (cells[idx.get(norm(col)) ?? -1] ?? "").trim());
    const line = i + 2;
    const ref = get(m.columns.externalRef) ?? "";
    const flag = (reason: FlagReason): ImportRow => ({ line, ref, status: "flagged", reason });

    if (m.rowFilter) {
      const v = (get(m.rowFilter.column) ?? "").toLowerCase();
      if (m.rowFilter.include && !m.rowFilter.include.includes(v)) return { line, ref, status: "ignored" };
      if (m.rowFilter.exclude?.includes(v)) return { line, ref, status: "ignored" };
    }
    if (!ref) return flag("missing_ref");
    const currency = get(m.columns.currency);
    if (currency !== undefined && currency.toUpperCase() !== "USD") return flag("non_usd");
    const checkIn = parseDate(get(m.columns.checkIn) ?? "", m.dateFormat);
    const checkOut = parseDate(get(m.columns.checkOut) ?? "", m.dateFormat);
    if (!checkIn || !checkOut || checkOut <= checkIn) return flag("invalid_date");
    const payout = amount(get(m.columns.payout));
    if (payout === null) return flag("invalid_amount");
    const propertyId = props.get(norm(get(m.columns.listing) ?? ""));
    if (!propertyId) return flag("unknown_listing");

    const gross = amount(get(m.columns.gross));
    const fee = amount(get(m.columns.fee));
    const cleaningFee = amount(get(m.columns.cleaningFee));
    const booking: ImportedBooking = {
      channel: m.channel,
      externalRef: ref,
      guestName: get(m.columns.guestName) ?? "",
      propertyId,
      checkIn,
      checkOut,
      payout,
      expectedNet: gross !== null && fee !== null && gross >= fee ? gross - fee : payout,
      ...(cleaningFee !== null ? { cleaningFee } : {}),
    };
    return { line, ref, status: "new", booking };
  });

  // duplicates inside the file: identical repeats → later ones are duplicates; disagreeing → flag all
  const byKey = new Map<string, ImportRow[]>();
  for (const r of parsed) if (r.booking) byKey.set(`${m.channel}:${r.ref}`, [...(byKey.get(`${m.channel}:${r.ref}`) ?? []), r]);
  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    const same = group.every((r) => r.booking!.payout === group[0].booking!.payout);
    group.forEach((r, i) => {
      if (!same) Object.assign(r, { status: "flagged", reason: "conflicting_duplicate" });
      else if (i > 0) r.status = "duplicate";
    });
  }

  // against what's already in the system
  for (const r of parsed) {
    if (r.status !== "new" || !r.booking) continue;
    const prev = ctx.existing.get(`${m.channel}:${r.ref}`);
    if (!prev) continue;
    if (prev.otaPayout === undefined) r.status = "update";
    else if (prev.otaPayout === r.booking.payout) r.status = "duplicate";
    else Object.assign(r, { status: "flagged", reason: "payout_changed" });
  }
  return parsed;
}

export function summarize(rows: ImportRow[]) {
  const n = (s: ImportRow["status"]) => rows.filter((r) => r.status === s).length;
  return { ok: n("new") + n("update"), flagged: n("flagged"), duplicate: n("duplicate"), ignored: n("ignored") };
}

export type ImportPreview = {
  format: string;
  headers: string[];
  rows: ImportRow[];
  summaryText: string;
};

/** Detect + map + preview. Unknown formats return headers so the UI can ask for a column mapping. */
export function importReport(text: string, ctx: ImportContext): ImportPreview {
  const rows = parseCsv(text);
  const headers = rows[0] ?? [];
  const fmt = detectFormat(headers);
  if (!fmt) return { format: "unknown", headers, rows: [], summaryText: "Unrecognized format: map the columns to continue" };
  const mapped = mapRows(rows, fmt, ctx);
  const s = summarize(mapped);
  return {
    format: fmt.id,
    headers,
    rows: mapped,
    summaryText: `${s.ok} will match, ${s.flagged} flagged, ${s.duplicate} duplicate${s.duplicate === 1 ? "" : "s"}`,
  };
}
