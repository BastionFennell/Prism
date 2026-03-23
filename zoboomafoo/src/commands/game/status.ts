import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const statusSubcommand = new SlashCommandSubcommandBuilder()
  .setName('status')
  .setDescription('Toggle a game between active and paused (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o
      .setName('status')
      .setDescription('New status')
      .setRequired(true)
      .addChoices(
        { name: '🔵 Active', value: 'active' },
        { name: '🟡 Paused', value: 'paused' }
      )
  );

export async function handleStatus(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can change game status.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const newStatus = interaction.options.getString('status', true) as 'active' | 'paused';
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    if (game.status === newStatus) {
      throw new AppError(`**${game.title}** is already ${newStatus}.`);
    }

    await gameService.setStatus(gameId, newStatus, interaction.user.id, config);

    const message = newStatus === 'active'
      ? `🔵 **${game.title}** is now active.`
      : `🟡 **${game.title}** has been paused.`;

    await interaction.editReply({ content: message });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
