import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChannelType,
  ChatInputCommandInteraction,
  EmbedBuilder,
  MessageFlags,
  SlashCommandBuilder,
} from "discord.js";
import { Database } from "../../db/client";
import { MessageReceipt } from "../../db/messages";

export const data = new SlashCommandBuilder()
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
    option.setName("content_contains").setDescription("Filter by body preview contains.").setRequired(false)
  )
  .addStringOption((option) =>
    option.setName("title_contains").setDescription("Filter by subject contains.").setRequired(false)
  );

function buildPageEmbed(records: MessageReceipt[], page: number, pageSize: number) {
  const start = page * pageSize;
  const slice = records.slice(start, start + pageSize);

  const embed = new EmbedBuilder().setTitle("History").setColor(0xf1c40f);

  if (!slice.length) {
    embed.setDescription("No matching records in the last 30 days.");
    return embed;
  }

  embed.setDescription(`Page ${page + 1} of ${Math.max(1, Math.ceil(records.length / pageSize))}`);

  embed.addFields(
    slice.map((r) => {
      const ackBy = r.acknowledgedName ?? (r.acknowledgedBy ? `<@${r.acknowledgedBy}>` : "Not acknowledged");
      const receivedTs =
        r.receivedAt && !Number.isNaN(Date.parse(r.receivedAt))
          ? `<t:${Math.floor(Date.parse(r.receivedAt) / 1000)}:f>`
          : r.receivedAt ?? "Unknown";
      const acked = r.acknowledgedAt ? `<t:${r.acknowledgedAt}:f>` : "Pending";
      const subject = r.subject || "(no subject)";
      const from = r.fromAddress || "Unknown";

      return {
        name: subject,
        value: [`From: ${from}`, `Received: ${receivedTs}`, `Ack: ${ackBy} at ${acked}`, `Mailbox: ${r.mailboxAddress}`, `Channel: <#${r.channelId}>`].join("\n"),
        inline: false,
      };
    })
  );

  return embed;
}

function buildNavRow(page: number, totalPages: number) {
  const prev = new ButtonBuilder()
    .setCustomId("history:prev")
    .setEmoji("◀️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page <= 0);

  const next = new ButtonBuilder()
    .setCustomId("history:next")
    .setEmoji("▶️")
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(page >= totalPages - 1);

  return new ActionRowBuilder<ButtonBuilder>().addComponents(prev, next);
}

export async function handleHistory(interaction: ChatInputCommandInteraction, db: Database): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({ content: "This command can only be used in a server." });
    return;
  }

  const channelFilter = interaction.options.getChannel("channel");
  const mailboxFilter = interaction.options.getString("mailbox_address")?.trim().toLowerCase();
  const acknowledgerFilter = interaction.options.getUser("acknowledger");
  const senderFilter = interaction.options.getString("sender")?.toLowerCase();
  const contentFilter = interaction.options.getString("content_contains")?.toLowerCase();
  const titleFilter = interaction.options.getString("title_contains")?.toLowerCase();

  const now = Math.floor(Date.now() / 1000);
  const thirtyDaysAgo = now - 30 * 86400;

  const matches = db.data.messageReceipts
    .filter((r) => r.guildId === interaction.guildId)
    .filter((r) => (channelFilter ? r.channelId === channelFilter.id : true))
    .filter((r) => (mailboxFilter ? r.mailboxAddress.toLowerCase() === mailboxFilter : true))
    .filter((r) => (acknowledgerFilter ? r.acknowledgedBy === acknowledgerFilter.id : true))
    .filter((r) => (senderFilter ? (r.fromAddress ?? "").toLowerCase().includes(senderFilter) : true))
    .filter((r) => (contentFilter ? (r.bodyPreview ?? "").toLowerCase().includes(contentFilter) : true))
    .filter((r) => (titleFilter ? (r.subject ?? "").toLowerCase().includes(titleFilter) : true))
    .filter((r) => (r.createdAt ?? now) >= thirtyDaysAgo)
    .sort((a, b) => (b.acknowledgedAt ?? b.createdAt ?? 0) - (a.acknowledgedAt ?? a.createdAt ?? 0));

  const pageSize = 5;
  let page = 0;
  const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));

  await interaction.reply({
    embeds: [buildPageEmbed(matches, page, pageSize)],
    components: [buildNavRow(page, totalPages)],
    flags: MessageFlags.Ephemeral,
  });

  const reply = await interaction.fetchReply();

  const collector = reply.createMessageComponentCollector({
    time: 60000,
    filter: (i) => i.user.id === interaction.user.id && i.customId.startsWith("history:"),
  });

  collector.on("collect", async (i: ButtonInteraction) => {
    if (i.customId === "history:prev") {
      page = Math.max(0, page - 1);
    } else if (i.customId === "history:next") {
      page = Math.min(Math.max(0, totalPages - 1), page + 1);
    }

    await i.update({
      embeds: [buildPageEmbed(matches, page, pageSize)],
      components: [buildNavRow(page, totalPages)],
    });
  });

  collector.on("end", () => {
    reply.edit({ components: [] }).catch(() => {});
  });
}
