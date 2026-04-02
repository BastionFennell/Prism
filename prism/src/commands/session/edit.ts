import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { SessionService } from '../../services/SessionService';
import { ScheduleService } from '../../services/ScheduleService';
import { GameService } from '../../services/GameService';
import { canManageGame } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { sessionEmbed } from '../../utils/embeds';

export const editSubcommand = new SlashCommandSubcommandBuilder()
  .setName('edit')
  .setDescription('Edit session details (Founder or GM only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption((o) =>
    o.setName('session').setDescription('Session name').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('title').setDescription('New title').setRequired(false)
  )
  .addIntegerOption((o) =>
    o.setName('duration').setDescription('New duration in minutes').setRequired(false).setMinValue(15)
  )
  .addStringOption((o) =>
    o.setName('notes').setDescription('New notes').setRequired(false)
  );

export async function handleEdit(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameId = interaction.options.getInteger('game', true);
    const sessionId = interaction.options.getInteger('session', true);
    const title = interaction.options.getString('title') ?? undefined;
    const duration = interaction.options.getInteger('duration') ?? undefined;
    const notes = interaction.options.getString('notes') ?? undefined;

    if (title === undefined && duration === undefined && notes === undefined) {
      throw new AppError('Provide at least one field to edit (title, duration, or notes).');
    }

    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    if (!canManageGame(interaction.member!, game, config)) {
      throw new AppError('Only Founders or the game GM can edit sessions.');
    }

    const sessionService = new SessionService(db);
    const updated = sessionService.updateSession(
      sessionId,
      { title, durationMinutes: duration, notes },
      interaction.user.id
    );

    const embed = sessionEmbed(updated, game.title);
    await interaction.editReply({ content: '✅ Session updated.', embeds: [embed] });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
