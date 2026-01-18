import { REST } from "@discordjs/rest";
import { Routes } from "discord-api-types/v10";
import { Client, Collection, Events, GatewayIntentBits, Interaction } from "discord.js";
import { Database } from "../db/client";
import * as ackCommand from "./commands/ack";
import * as removeRuleCommand from "./commands/removeRule";
import * as setRuleCommand from "./commands/setRule";
import { handleSetRuleModal, isSetRuleModal } from "./commands/setRule";
import {
  handleAck,
  handleShowMore,
  isAck,
  isShowMore,
} from "./interactions";

type CommandModule = {
  data: any;
  handle: (interaction: Interaction, db: Database) => Promise<void>;
};

export function createClient(db: Database): Client {
  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildMessageReactions],
  });

  const commands = new Collection<string, CommandModule>();
  commands.set(ackCommand.data.name, { data: ackCommand.data, handle: (i, db) => ackCommand.handleAck(i as any, db) });

  client.once(Events.ClientReady, async () => {
    console.log(`Logged in as ${client.user?.tag}`);
    client.user?.setActivity("/ack for help");
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
      } else if (isShowMore(interaction)) {
        await handleShowMore(interaction, db);
      }
    } else if (interaction.isStringSelectMenu()) {
      if (removeRuleCommand.isRemoveRuleSelect(interaction)) {
        await removeRuleCommand.handleRemoveRuleSelect(interaction as any, db);
      }
    } else if (interaction.isModalSubmit()) {
      if (isSetRuleModal(interaction)) {
        await handleSetRuleModal(interaction as any, db);
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
