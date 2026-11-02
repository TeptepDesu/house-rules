import { randomBytes } from "node:crypto";

/** Unguessable public id for guest-facing URLs (invoice pay pages): 128 bits, base64url (22 chars). */
export function newPublicId(): string {
  return randomBytes(16).toString("base64url");
}

/** Human-friendly reference for a direct booking, e.g. "D-7KQ2MX" (unique per operator via the DB index). */
export function newDirectRef(): string {
  const alphabet = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L
  return `D-${Array.from(randomBytes(6), (b) => alphabet[b % alphabet.length]).join("")}`;
}
