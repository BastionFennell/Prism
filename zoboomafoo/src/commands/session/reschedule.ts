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

export const rescheduleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('reschedule')
  .setDescription('Reschedule a session to a new date/time (Founder only)')
  .addIntegerOption((o) =>
    o.setName('session').setDescription('Session').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('date').setDescription('New date in YYYY-MM-DD format').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('time').setDescription('New start time in HH:MM (24-hour)').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('timezone').setDescription('IANA timezone (leave blank to keep original)').setRequired(false)
  );

export async function handleReschedule(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can reschedule sessions.');
    }

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);
    const sessionId = interaction.options.getInteger('session', true);
    const dateStr = interaction.options.getString('date', true);
    const timeStr = interaction.options.getString('time', true);
    const newTz = interaction.options.getString('timezone') ?? undefined;

    if (newTz && !isValidTimezone(newTz)) {
      throw new AppError(`"${newTz}" is not a valid IANA timezone.`);
    }

    const sessionService = new SessionService(db);
    const session = sessionService.getSession(sessionId);
    const timezone = newTz ?? session.timezone;

    const startAt = parseSessionTime(dateStr, timeStr, timezone);
    const updated = sessionService.updateSession(sessionId, { startAt, timezone }, interaction.user.id);

    const embed = sessionEmbed(updated, game.title);
    await interaction.editReply({ content: '✅ Session rescheduled.', embeds: [embed] });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
    scheduleService.renderGameSchedule(game.id).catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
