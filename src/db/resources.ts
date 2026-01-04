import { Kysely } from "kysely";
import { DB, ResourceTable } from "./connection";
import { normalizeAddress } from "./settings";

export interface MailboxResource {
  id: string;
  mailboxAddress: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  accessToken: string | null;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface MailboxResourceInput {
  id?: string;
  mailboxAddress: string;
  tenantId: string;
  clientId: string;
  clientSecret: string;
  accessToken?: string | null;
  expiresAt?: number | null;
}

function mapResource(row: ResourceTable): MailboxResource {
  return {
    id: row.id,
    mailboxAddress: row.mailbox_address,
    tenantId: row.tenant_id,
    clientId: row.client_id,
    clientSecret: row.client_secret,
    accessToken: row.access_token ?? null,
    expiresAt: row.expires_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function upsertResource(db: Kysely<DB>, resource: MailboxResourceInput): Promise<MailboxResource> {
  const now = Math.floor(Date.now() / 1000);
  const normalized = normalizeAddress(resource.mailboxAddress);
  const id = resource.id ?? normalized;

  await db
    .insertInto("resources")
    .values({
      id,
      mailbox_address: normalized,
      tenant_id: resource.tenantId,
      client_id: resource.clientId,
      client_secret: resource.clientSecret,
      access_token: resource.accessToken ?? null,
      expires_at: resource.expiresAt ?? null,
      created_at: now,
      updated_at: now,
    })
    .onConflict((oc) =>
      oc.column("id").doUpdateSet({
        mailbox_address: normalized,
        tenant_id: resource.tenantId,
        client_id: resource.clientId,
        client_secret: resource.clientSecret,
        access_token: resource.accessToken ?? null,
        expires_at: resource.expiresAt ?? null,
        updated_at: now,
      })
    )
    .execute();

  const row = await getResourceById(db, id);
  if (!row) throw new Error("Failed to upsert resource");
  return row;
}

export async function getResourceById(db: Kysely<DB>, id: string): Promise<MailboxResource | null> {
  const row = await db.selectFrom("resources").selectAll().where("id", "=", id).executeTakeFirst();
  return row ? mapResource(row) : null;
}

export async function findResourceByMailbox(db: Kysely<DB>, mailboxAddress: string): Promise<MailboxResource | null> {
  const normalized = normalizeAddress(mailboxAddress);
  const row = await db
    .selectFrom("resources")
    .selectAll()
    .where("mailbox_address", "=", normalized)
    .executeTakeFirst();
  return row ? mapResource(row) : null;
}
