import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { Client, Collection, Events, GatewayIntentBits, Interaction } from "discord.js";
import { Database } from "../db/client";
import * as setupCommand from "./commands/setup";
import * as updateCommand from "./commands/update";
import {
  handleAck,
  handleUnsubscribe,
  handleUnsubscribeModal,
  handleShowRules,
  isAck,
  isShowRules,
  isUnsub,
  isUnsubModal,
} from "./interactions";

type CommandModule = {
  data: any;
  handle: (interaction: Interaction, db: Database) => Promise<void>;
};

export function createClient(db: Database): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  });

  const commands = new Collection<string, CommandModule>();
  commands.set(setupCommand.data.name, { data: setupCommand.data, handle: (i, db) => setupCommand.handleSetup(i as any, db) });
  commands.set(updateCommand.data.name, { data: updateCommand.data, handle: (i, db) => updateCommand.handleUpdate(i as any, db) });

  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    await registerSlashCommands(commands);
  });

  client.on("interactionCreate", async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const command = commands.get(interaction.commandName);
      if (!command) return;
      await command.handle(interaction, db);
    } else if (interaction.isButton()) {
      if (isAck(interaction)) {
        await handleAck(interaction, db);
      } else if (isUnsub(interaction)) {
        await handleUnsubscribe(interaction, db);
      } else if (isShowRules(interaction)) {
        await handleShowRules(interaction, db);
      }
    } else if (interaction.isModalSubmit()) {
      if (isUnsubModal(interaction)) {
        await handleUnsubscribeModal(interaction, db);
      }
    }
  });

  return client;
}

async function registerSlashCommands(commands: Collection<string, CommandModule>): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN ?? "");
  const body = Array.from(commands.values()).map((cmd) => cmd.data.toJSON());
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!clientId) {
    console.warn("DISCORD_CLIENT_ID not set; skipping slash command registration.");
    return;
  }

  try {
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log("Registered global slash commands.");
  } catch (err) {
    console.error("Failed to register slash commands", err);
  }
}
