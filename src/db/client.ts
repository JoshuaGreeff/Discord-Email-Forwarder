import { Kysely } from "kysely";
import { ensureSchema, getDb, DB } from "./connection";

export { getDb, ensureSchema };
export type DbClient = ReturnType<typeof getDb>;
export type Database = Kysely<DB>;
