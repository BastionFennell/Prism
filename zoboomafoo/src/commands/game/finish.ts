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
import { MembershipService } from '../../services/MembershipService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { confirmEmbed } from '../../utils/embeds';

export const finishSubcommand = new SlashCommandSubcommandBuilder()
  .setName('finish')
  .setDescription('Mark a game as finished — releases roles and archives channel (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleFinish(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can finish games.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);
    const memberCount = new MembershipService(db).getMemberCount(gameId);

    const embed = confirmEmbed(
      'Finish Game',
      `Are you sure you want to mark **${game.title}** as finished?\n\n` +
      `This will:\n` +
      `• Remove the game role from all ${memberCount} members\n` +
      `• Move the channel to the archived category\n` +
      `• Cancel all scheduled sessions\n\n` +
      `**This action cannot be undone.**`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:finish:${gameId}`)
        .setLabel('Yes, finish it')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel:finish:${gameId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
