import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { SessionService } from '../../services/SessionService';
import { ScheduleService } from '../../services/ScheduleService';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { resolveGame } from '../../utils/context';

export const cancelSubcommand = new SlashCommandSubcommandBuilder()
  .setName('cancel')
  .setDescription('Cancel a scheduled session (Founder only)')
  .addIntegerOption((o) =>
    o.setName('session').setDescription('Session').setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  );

export async function handleCancel(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can cancel sessions.');
    }

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);
    const sessionId = interaction.options.getInteger('session', true);

    const sessionService = new SessionService(db);
    const session = sessionService.getSession(sessionId);
    sessionService.setSessionStatus(sessionId, 'canceled', interaction.user.id);

    await interaction.editReply({
      content: `✅ **${session.title ?? 'Session'}** for **${game.title}** has been canceled.`,
    });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
    scheduleService.renderGameSchedule(game.id).catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
