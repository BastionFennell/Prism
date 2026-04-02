import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandSubcommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { confirmEmbed } from '../../utils/embeds';

export const relinkThreadSubcommand = new SlashCommandSubcommandBuilder()
  .setName('relink-thread')
  .setDescription('Manually link a game to an existing thread (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('thread_id').setDescription('Discord thread ID to link').setRequired(true)
  );

export async function handleRelinkThread(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can relink threads.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const threadId = interaction.options.getString('thread_id', true);

    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    const embed = confirmEmbed(
      'Relink Thread',
      `Link **${game.title}** to thread <#${threadId}>?\n\n` +
      `Current thread: ${game.discordThreadId ? `<#${game.discordThreadId}>` : 'None'}`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:relink-thread:${game.id}:${threadId}`)
        .setLabel('Yes, relink it')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`cancel:relink-thread:${game.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
