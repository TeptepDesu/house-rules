import { randomBytes } from "node:crypto";

/** Unguessable public id for guest-facing URLs (invoice pay pages): 128 bits, base64url (22 chars). */
export function newPublicId(): string {
  return randomBytes(16).toString("base64url");
}
