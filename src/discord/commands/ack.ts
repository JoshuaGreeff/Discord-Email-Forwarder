import {
  ChannelType,
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { handleHistory } from "./history";
import { handleHelp } from "./help";
import { handleRemoveMailbox } from "./removeMailbox";
import { handleRemoveRule } from "./removeRule";
import { handleSetRule } from "./setRule";
import { handleSettings } from "./settings";
import { handleSetup } from "./setup";
import { handleUpdate } from "./update";

export const data = new SlashCommandBuilder()
  .setName("ack")
  .setDescription("/ack for help")
  .addSubcommand((sub) =>
    sub
      .setName("settings")
      .setDescription("Show current settings for this server (optional filters).")
      .addChannelOption((option) =>
        option
          .setName("channel")
          .setDescription("Filter by configured channel.")
          .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
          .setRequired(false)
      )
      .addStringOption((option) =>
        option.setName("mailbox_address").setDescription("Filter by mailbox address.").setRequired(false)
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName("email")
      .setDescription("Manage mailbox bindings and history.")
      .addSubcommand((sub) =>
        sub
          .setName("setup")
          .setDescription("Configure a channel to receive Microsoft 365 emails using app-only auth.")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Channel that will receive forwarded email notifications.")
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("mailbox_address")
              .setDescription("The shared mailbox address to read from.")
              .setRequired(true)
          )
          .addStringOption((option) => option.setName("tenant_id").setDescription("Azure AD tenant ID.").setRequired(true))
          .addStringOption((option) =>
            option
              .setName("client_id")
              .setDescription("Azure app registration client ID.")
              .setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("client_secret")
              .setDescription("Azure app registration client secret.")
              .setRequired(true)
          )
          .addIntegerOption((option) =>
            option
              .setName("ack_expiry_days")
              .setDescription("Days before auto-ack (default 5). Set 0 to never auto-ack.")
              .setMinValue(0)
              .setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("check_junk")
              .setDescription("Also poll the Junk folder (default: false).")
              .setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("mailbox_alias")
              .setDescription("Optional friendly alias shown in acknowledgements.")
              .setRequired(false)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("update")
          .setDescription("Update channel email forwarding settings.")
          .addStringOption((option) =>
            option.setName("mailbox_address").setDescription("Shared mailbox address to update.").setRequired(true)
          )
          .addStringOption((option) =>
            option
              .setName("mailbox_alias")
              .setDescription("Friendly mailbox label (shown in Discord).")
              .setRequired(false)
          )
          .addStringOption((option) =>
            option.setName("tenant_id").setDescription("Azure AD tenant ID.").setRequired(false)
          )
          .addStringOption((option) =>
            option.setName("client_id").setDescription("Azure app registration client ID.").setRequired(false)
          )
          .addStringOption((option) =>
            option.setName("client_secret").setDescription("Azure app client secret.").setRequired(false)
          )
          .addBooleanOption((option) =>
            option
              .setName("check_junk")
              .setDescription("Also poll the Junk folder (default follows current setting).")
              .setRequired(false)
          )
          .addIntegerOption((option) =>
            option
              .setName("ack_expiry_days")
              .setDescription("Days before auto-ack (default 5). Set 0 to never auto-ack.")
              .setMinValue(0)
              .setRequired(false)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("delete")
          .setDescription("Remove a mailbox configuration from a channel.")
          .addStringOption((option) =>
            option.setName("mailbox_address").setDescription("Mailbox address to remove.").setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("history")
          .setDescription("Show acknowledged email history (last 30 days).")
          .addChannelOption((option) =>
            option
              .setName("channel")
              .setDescription("Filter by Discord channel.")
              .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
              .setRequired(false)
          )
          .addStringOption((option) =>
            option.setName("mailbox_address").setDescription("Filter by mailbox address.").setRequired(false)
          )
          .addUserOption((option) =>
            option.setName("acknowledger").setDescription("Filter by who acknowledged.").setRequired(false)
          )
          .addStringOption((option) =>
            option.setName("sender").setDescription("Filter by email sender (contains match).").setRequired(false)
          )
          .addStringOption((option) =>
            option
              .setName("content_contains")
              .setDescription("Filter by body preview contains.")
              .setRequired(false)
          )
          .addStringOption((option) =>
            option.setName("title_contains").setDescription("Filter by subject contains.").setRequired(false)
          )
      )
  )
  .addSubcommandGroup((group) =>
    group
      .setName("rule")
      .setDescription("Manage skip rules.")
      .addSubcommand((sub) =>
        sub
          .setName("create")
          .setDescription("Create or update a skip rule for a mailbox.")
          .addStringOption((option) =>
            option.setName("mailbox_address").setDescription("Mailbox address to filter.").setRequired(true)
          )
      )
      .addSubcommand((sub) =>
        sub
          .setName("remove")
          .setDescription("Remove a skip rule for a mailbox.")
          .addStringOption((option) =>
            option.setName("mailbox_address").setDescription("Mailbox address to filter.").setRequired(true)
          )
      )
  );

export async function handleAck(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  const group = interaction.options.getSubcommandGroup(false);
  const subcommand = interaction.options.getSubcommand(false);

  if (!group && !subcommand) {
    await handleHelp(interaction, db);
    return;
  }

  if (group === "email") {
    if (subcommand === "setup") {
      await handleSetup(interaction, db);
      return;
    }

    if (subcommand === "update") {
      await handleUpdate(interaction, db);
      return;
    }

    if (subcommand === "delete") {
      await handleRemoveMailbox(interaction, db);
      return;
    }

    if (subcommand === "history") {
      await handleHistory(interaction, db);
      return;
    }
  }

  if (!group && subcommand === "settings") {
    await handleSettings(interaction, db);
    return;
  }

  if (group === "rule") {
    if (subcommand === "create") {
      await handleSetRule(interaction, db);
      return;
    }

    if (subcommand === "remove") {
      await handleRemoveRule(interaction, db);
      return;
    }
  }

  await interaction.reply({ content: "Unknown subcommand. Use /ack for help.", flags: MessageFlags.Ephemeral });
}
