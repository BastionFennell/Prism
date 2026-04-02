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
import { canManageGame } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { confirmEmbed } from '../../utils/embeds';

export const finishSubcommand = new SlashCommandSubcommandBuilder()
  .setName('finish')
  .setDescription('Mark a game as finished — releases roles and archives thread (Founder or GM)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleFinish(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    if (!canManageGame(interaction.member!, game, config)) {
      throw new AppError('Only Founders or the game GM can finish a game.');
    }

    const embed = confirmEmbed(
      'Finish Game',
      `Are you sure you want to mark **${game.title}** as finished?\n\n` +
      `This will:\n` +
      `• Remove the game role from all ${gameService.getMemberCount(game.id)} members\n` +
      `• Archive the game thread\n` +
      `• Release the pooled role back to the pool\n\n` +
      `**This action cannot be undone.**`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:finish:${game.id}`)
        .setLabel('Yes, finish it')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel:finish:${game.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
