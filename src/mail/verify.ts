import { getAppOnlyToken, getGraphClient } from "../graph/auth";
import { fetchUnreadMessages } from "../graph/mail";

export type VerifyResult =
  | { ok: true; tokens: { accessToken: string; expiresAt: number } }
  | { ok: false; error: string };

export async function verifyMailboxAccess(params: {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  mailboxAddress: string;
}): Promise<VerifyResult> {
  try {
    const tokens = await getAppOnlyToken({
      tenantId: params.tenantId,
      clientId: params.clientId,
      clientSecret: params.clientSecret,
    });

    const graph = getGraphClient(tokens.accessToken);
    // Quick fetch to validate access; do not mutate (no mark read).
    await fetchUnreadMessages(graph, params.mailboxAddress);

    return { ok: true, tokens };
  } catch (err: any) {
    const message = err?.message ?? String(err);
    return { ok: false, error: message };
  }
}
