import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { canManageGame } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const pauseSubcommand = new SlashCommandSubcommandBuilder()
  .setName('pause')
  .setDescription('Pause a game (Founder or GM only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handlePause(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    if (!canManageGame(interaction.member!, game, config)) {
      throw new AppError('Only Founders or the game GM can pause a game.');
    }

    await gameService.setStatus(gameId, 'paused', interaction.user.id, config);
    await interaction.editReply({ content: `⏸ **${game.title}** has been paused.` });

    const { ScheduleService } = await import('../../services/ScheduleService');
    new ScheduleService(db, client, config).renderRoster().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
