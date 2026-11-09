"use server";

import { z } from "zod";
import { requireUser } from "@/lib/auth/dal";
import { logActivity } from "@/lib/db";
import { statementLink } from "@/lib/db/statements";

// Sharing a payee's statement: the operator gets the read-only link for one of THEIR payees.
// The token is created on first share and stays the same after; the page shows no guest names.

export async function shareStatementLink(payeeId: string): Promise<{ ok: true; path: string } | { ok: false; error: string }> {
  const user = await requireUser();
  const id = z.string().uuid().safeParse(payeeId);
  if (!id.success) return { ok: false, error: "That payee doesn't exist." };
  try {
    const link = await statementLink(user.id, id.data);
    if (!link) return { ok: false, error: "That payee doesn't exist." };
    // logged once, when the link is made: copying it again changes nothing
    if (link.created) await logActivity({ userId: user.id, action: "payee.statement_link", entity: "payee", entityId: id.data, meta: { name: link.payeeName, nearAccount: link.nearAccount } });
    return { ok: true, path: `/statement/${link.token}` };
  } catch (e) {
    console.error("[people.shareStatementLink] failed", e);
    return { ok: false, error: "Couldn't make the link. Try again." };
  }
}
