import dotenv from "dotenv";
dotenv.config();

import express from "express";
import { getDb } from "./db/client";
import { runMigrations } from "./db/schema";
import { createClient } from "./discord/bot";
import { getChannelSettings, upsertChannelSettings } from "./db/settings";
import { exchangeCodeForToken } from "./graph/auth";
import { startPolling } from "./emailPoller";

async function bootstrap() {
  const db = await getDb();
  await runMigrations(db);

  const client = createClient(db);
  const token = process.env.DISCORD_TOKEN;
  if (!token) {
    console.error("DISCORD_TOKEN not set");
    process.exit(1);
  }

  const app = express();
  app.get("/health", (_req, res) => res.json({ ok: true }));

  app.get("/auth/callback", async (req, res) => {
    const code = req.query.code as string | undefined;
    const state = req.query.state as string | undefined;
    if (!code || !state) {
      res.status(400).send("Missing code or state.");
      return;
    }

    let guildId = "";
    let channelId = "";
    try {
      const decoded = Buffer.from(state, "base64url").toString("utf8");
      [guildId, channelId] = decoded.split(":");
    } catch (err) {
      res.status(400).send("Invalid state.");
      return;
    }

    const settings = await getChannelSettings(db, guildId, channelId);
    if (!settings) {
      res.status(400).send("No stored settings for this channel. Run /setup again.");
      return;
    }

    try {
      const tokens = await exchangeCodeForToken({
        tenantId: settings.tenantId,
        clientId: settings.clientId,
        clientSecret: settings.clientSecret,
        redirectUri: settings.redirectUri,
        code,
      });

      await upsertChannelSettings(db, {
        ...settings,
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        expiresAt: tokens.expiresAt,
      });

      res.status(200).send("Authorized! You can close this window.");
    } catch (err: any) {
      console.error("Auth callback failed", err);
      res.status(500).send("Token exchange failed. Check logs.");
    }
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3000;
  app.listen(port, () => {
    console.log(`Auth callback server listening on ${port}`);
  });

  startPolling(db, client);

  await client.login(token);
}

bootstrap().catch((err) => {
  console.error(err);
  process.exit(1);
});
