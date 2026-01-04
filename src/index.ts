import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { getDb, ensureSchema } from "./db/client";
import { createClient } from "./discord/bot";
import { startPolling } from "./emailPoller";

async function bootstrap() {
  const db = getDb();
  await ensureSchema(db);

  const client = createClient(db);
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("DISCORD_TOKEN not set");
    process.exit(1);
  }

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, () => {
    console.log(`Health server listening on ${port}`);
  });

  await client.login(token);
  startPolling(db, client);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
