import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { SessionService } from '../../services/SessionService';
import { ScheduleService } from '../../services/ScheduleService';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { parseSessionTime, isValidTimezone } from '../../utils/time';
import { sessionEmbed } from '../../utils/embeds';
import { resolveGame } from '../../utils/context';

export const addSubcommand = new SlashCommandSubcommandBuilder()
  .setName('add')
  .setDescription('Schedule a session for a game (Founder only)')
  .addStringOption((o) =>
    o.setName('date').setDescription('Date in YYYY-MM-DD format').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('time').setDescription('Start time in HH:MM (24-hour)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('timezone').setDescription('IANA timezone e.g. America/New_York').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('title').setDescription('Session title').setRequired(false)
  )
  .addIntegerOption((o) =>
    o.setName('duration').setDescription('Duration in minutes').setRequired(false).setMinValue(15)
  )
  .addStringOption((o) =>
    o.setName('notes').setDescription('Additional notes').setRequired(false)
  );

export async function handleAdd(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can add sessions.');
    }

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);

    const dateStr = interaction.options.getString('date', true);
    const timeStr = interaction.options.getString('time', true);
    const timezone = interaction.options.getString('timezone', true);
    const title = interaction.options.getString('title') ?? undefined;
    const duration = interaction.options.getInteger('duration') ?? undefined;
    const notes = interaction.options.getString('notes') ?? undefined;

    if (!isValidTimezone(timezone)) {
      throw new AppError(`"${timezone}" is not a valid IANA timezone. Example: America/New_York`);
    }

    const startAt = parseSessionTime(dateStr, timeStr, timezone);

    const sessionService = new SessionService(db);
    const session = sessionService.createSession(
      { gameId: game.id, title, notes, startAt, durationMinutes: duration, timezone },
      interaction.user.id,
      config
    );

    const embed = sessionEmbed(session, game.title);
    await interaction.editReply({ content: '✅ Session scheduled!', embeds: [embed] });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.postSessionAnnouncement(session, game).catch(console.error);
    scheduleService.renderSchedule().catch(console.error);
    scheduleService.renderGameSchedule(game.id).catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
