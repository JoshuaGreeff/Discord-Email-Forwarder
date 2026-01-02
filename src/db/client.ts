import path from "path";
import fs from "fs";
import sqlite3 from "sqlite3";
import { Database, open } from "sqlite";

let dbInstance: Database | null = null;

export async function getDb(): Promise<Database> {
  if (dbInstance) {
    return dbInstance;
  }

  const dbDir = path.join(process.cwd(), "data");
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }

  dbInstance = await open({
    filename: path.join(dbDir, "bot.db"),
    driver: sqlite3.Database,
  });

  return dbInstance;
}
