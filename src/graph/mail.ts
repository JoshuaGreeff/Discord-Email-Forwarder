import { Client } from "@microsoft/microsoft-graph-client";

export interface MailMessage {
  id: string;
  from?: string;
  subject: string;
  body: string;
  bodyType: string;
  receivedAt?: string;
}

export async function fetchUnreadMessages(client: Client, mailboxAddress: string, top = 10): Promise<MailMessage[]> {
  const res = await client
    .api(`/users/${mailboxAddress}/mailFolders/inbox/messages`)
    .filter("isRead eq false")
    .top(top)
    .get();

  const values = (res.value ?? []) as any[];
  return values.map((msg) => ({
    id: msg.id,
    from: msg.from?.emailAddress?.address,
    subject: msg.subject ?? "(no subject)",
    body: msg.body?.content ?? "",
    bodyType: msg.body?.contentType ?? "text",
    receivedAt: msg.receivedDateTime,
  }));
}

export async function markMessageRead(client: Client, mailboxAddress: string, messageId: string): Promise<void> {
  await client.api(`/users/${mailboxAddress}/messages/${messageId}`).patch({ isRead: true });
}
