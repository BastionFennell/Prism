import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { SessionService } from '../../services/SessionService';
import { ScheduleService } from '../../services/ScheduleService';
import { GameService } from '../../services/GameService';
import { canManageGame } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const cancelSubcommand = new SlashCommandSubcommandBuilder()
  .setName('cancel')
  .setDescription('Cancel a scheduled session (Founder or GM only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption((o) =>
    o.setName('session').setDescription('Session name').setRequired(true).setAutocomplete(true)
  );

export async function handleCancel(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameId = interaction.options.getInteger('game', true);
    const sessionId = interaction.options.getInteger('session', true);

    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    if (!canManageGame(interaction.member!, game, config)) {
      throw new AppError('Only Founders or the game GM can cancel sessions.');
    }

    const sessionService = new SessionService(db);
    const session = sessionService.getSession(sessionId);
    sessionService.setSessionStatus(sessionId, 'canceled', interaction.user.id);

    await interaction.editReply({
      content: `✅ **${session.title ?? 'Session'}** for **${game.title}** has been canceled.`,
    });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
