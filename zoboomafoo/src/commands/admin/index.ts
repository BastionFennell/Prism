import {
  ChatInputCommandInteraction,
  SlashCommandBuilder,
  MessageFlags,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { ScheduleService } from '../../services/ScheduleService';
import { ChannelService } from '../../services/ChannelService';
import { AnnouncementService } from '../../services/AnnouncementService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { confirmEmbed } from '../../utils/embeds';
import { parseSessionTime, isValidTimezone } from '../../utils/time';
import { setupSubcommand, handleSetup } from './setup';

export const adminCommandData = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Admin commands (Founder only)')
  .addSubcommand(setupSubcommand)
  .addSubcommand((s) =>
    s.setName('rebuild-schedule').setDescription('Rebuild the schedule channel messages')
  )
  .addSubcommand((s) =>
    s
      .setName('inspect-game')
      .setDescription('Show raw game state for debugging')
      .addIntegerOption((o) =>
        o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('relink')
      .setDescription('Link a game to an existing channel and/or role')
      .addIntegerOption((o) =>
        o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
      )
      .addChannelOption((o) =>
        o.setName('channel').setDescription('Channel to link').setRequired(false)
      )
      .addRoleOption((o) =>
        o.setName('role').setDescription('Role to link').setRequired(false)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('delete-game')
      .setDescription('Permanently delete a game and all its data')
      .addIntegerOption((o) =>
        o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
      )
  )
  .addSubcommand((s) =>
    s
      .setName('schedule-announcement')
      .setDescription('Schedule a message to be posted to a channel at a given time')
      .addStringOption((o) =>
        o.setName('message_id').setDescription('ID of the message to relay').setRequired(true)
      )
      .addChannelOption((o) =>
        o.setName('source_channel').setDescription('Channel the message is in').setRequired(true)
      )
      .addChannelOption((o) =>
        o.setName('target_channel').setDescription('Channel to post it to').setRequired(true)
      )
      .addStringOption((o) =>
        o.setName('date').setDescription('Date in YYYY-MM-DD format').setRequired(true)
      )
      .addStringOption((o) =>
        o.setName('time').setDescription('Time in HH:MM (24-hour)').setRequired(true)
      )
      .addStringOption((o) =>
        o.setName('timezone').setDescription('IANA timezone e.g. America/New_York').setRequired(true)
      )
  );

export async function handleAdminCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === 'setup') {
    await handleSetup(interaction, config);
    return;
  }

  // All other admin commands require Founder
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can use admin commands.', flags: MessageFlags.Ephemeral });
    return;
  }

  try {
    if (sub === 'rebuild-schedule') {
      const embed = confirmEmbed(
        'Rebuild Schedule',
        'This will delete and re-post all schedule messages. Are you sure?'
      );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId('confirm:rebuild-schedule')
          .setLabel('Yes, rebuild')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('cancel:rebuild-schedule')
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
      return;
    }

    if (sub === 'inspect-game') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const gameId = interaction.options.getInteger('game', true);
      const gameService = new GameService(db, client);
      const game = gameService.getGame(gameId);
      await interaction.editReply({
        content: `\`\`\`json\n${JSON.stringify(game, null, 2)}\n\`\`\``,
      });
      return;
    }

    if (sub === 'relink') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const gameId = interaction.options.getInteger('game', true);
      const channel = interaction.options.getChannel('channel') ?? undefined;
      const role = interaction.options.getRole('role') ?? undefined;

      if (!channel && !role) {
        await interaction.editReply({ content: '❌ Provide at least a channel or a role to relink.' });
        return;
      }

      const gameService = new GameService(db, client);
      const game = gameService.getGame(gameId);

      const parts: string[] = [];
      if (channel) parts.push(`channel → <#${channel.id}>`);
      if (role) parts.push(`role → <@&${role.id}>`);

      const embed = confirmEmbed(
        'Relink Game',
        `Update **${game.title}**:\n${parts.join('\n')}`
      );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm:relink:${gameId}:${channel?.id ?? ''}:${role?.id ?? ''}`)
          .setLabel('Yes, relink')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId(`cancel:relink:${gameId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.editReply({ embeds: [embed], components: [row] });
      return;
    }

    if (sub === 'schedule-announcement') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });

      const messageId     = interaction.options.getString('message_id', true);
      const sourceChannel = interaction.options.getChannel('source_channel', true);
      const targetChannel = interaction.options.getChannel('target_channel', true);
      const dateStr       = interaction.options.getString('date', true);
      const timeStr       = interaction.options.getString('time', true);
      const timezone      = interaction.options.getString('timezone', true);

      if (!isValidTimezone(timezone)) {
        await interaction.editReply({ content: `❌ "${timezone}" is not a valid IANA timezone.` });
        return;
      }

      const sendAt = parseSessionTime(dateStr, timeStr, timezone);

      if (sendAt <= new Date()) {
        await interaction.editReply({ content: '❌ That time is in the past.' });
        return;
      }

      const announcementService = new AnnouncementService(db, client);
      const entry = announcementService.schedule(
        messageId,
        sourceChannel.id,
        targetChannel.id,
        sendAt,
        interaction.user.id
      );

      await interaction.editReply({
        content: `✅ Announcement #${entry.id} scheduled.\n📨 Message \`${messageId}\` from <#${sourceChannel.id}> → <#${targetChannel.id}>\n🕐 <t:${Math.floor(sendAt.getTime() / 1000)}:F> (<t:${Math.floor(sendAt.getTime() / 1000)}:R>)`,
      });
      return;
    }

    if (sub === 'delete-game') {
      const gameId = interaction.options.getInteger('game', true);
      const gameService = new GameService(db, client);
      const game = gameService.getGame(gameId);

      const embed = confirmEmbed(
        'Delete Game',
        `Permanently delete **${game.title}** and all associated sessions, characters, and audit history?\n\n**This cannot be undone.**`
      );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm:delete-game:${gameId}`)
          .setLabel('Yes, delete permanently')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`cancel:delete-game:${gameId}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
      return;
    }
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
