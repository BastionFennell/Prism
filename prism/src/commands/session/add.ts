import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { SessionService } from '../../services/SessionService';
import { ScheduleService } from '../../services/ScheduleService';
import { GameService } from '../../services/GameService';
import { canManageGame } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { parseSessionTime, isValidTimezone } from '../../utils/time';
import { sessionEmbed } from '../../utils/embeds';

export const addSubcommand = new SlashCommandSubcommandBuilder()
  .setName('add')
  .setDescription('Schedule a session for a game')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('date').setDescription('Date in YYYY-MM-DD format').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('time').setDescription('Start time in HH:MM (24-hour)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('timezone').setDescription('IANA timezone e.g. America/New_York').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('title').setDescription('Session title (optional)').setRequired(false)
  )
  .addIntegerOption((o) =>
    o.setName('duration').setDescription('Duration in minutes (optional)').setRequired(false).setMinValue(15)
  )
  .addStringOption((o) =>
    o.setName('notes').setDescription('Additional notes (optional)').setRequired(false)
  );

export async function handleAdd(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameId = interaction.options.getInteger('game', true);
    const dateStr = interaction.options.getString('date', true);
    const timeStr = interaction.options.getString('time', true);
    const timezone = interaction.options.getString('timezone', true);
    const title = interaction.options.getString('title') ?? undefined;
    const duration = interaction.options.getInteger('duration') ?? undefined;
    const notes = interaction.options.getString('notes') ?? undefined;

    if (!isValidTimezone(timezone)) {
      throw new AppError(`"${timezone}" is not a valid IANA timezone. Example: America/New_York`);
    }

    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    if (!canManageGame(interaction.member!, game, config)) {
      throw new AppError('Only Founders or the game GM can add sessions.');
    }

    const startAt = parseSessionTime(dateStr, timeStr, timezone);

    const sessionService = new SessionService(db);
    const session = sessionService.createSession(
      { gameId, title, notes, startAt, durationMinutes: duration, timezone },
      interaction.user.id,
      config
    );

    const embed = sessionEmbed(session, game.title);
    await interaction.editReply({ content: '✅ Session scheduled!', embeds: [embed] });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
