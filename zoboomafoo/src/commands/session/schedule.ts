import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { schedulingPolls } from '../../db/schema';
import { GameService } from '../../services/GameService';
import { MembershipService } from '../../services/MembershipService';
import { SchedulingPollService } from '../../services/SchedulingPollService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { isValidTimezone } from '../../utils/time';
import { resolveGame } from '../../utils/context';
import { DateTime } from 'luxon';

export const scheduleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule')
  .setDescription('Create a WhenIsGood-style availability poll to find a session time (Founder only)')
  .addStringOption((o) =>
    o.setName('date_start').setDescription('Poll start date (YYYY-MM-DD)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('date_end').setDescription('Poll end date (YYYY-MM-DD)').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('duration').setDescription('Session length in hours').setRequired(true).setMinValue(1).setMaxValue(8)
  )
  .addStringOption((o) =>
    o.setName('window_start').setDescription('Earliest daily start time (HH:MM, 24-hour)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('window_end').setDescription('Latest daily end time (HH:MM, 24-hour)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('timezone').setDescription('IANA timezone e.g. America/New_York').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  )
  .addIntegerOption((o) =>
    o.setName('expiry_hours').setDescription('Hours to keep poll open (default 72)').setRequired(false).setMinValue(1).setMaxValue(336)
  );

export async function handleSchedule(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can create scheduling polls.');
    }

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);

    const dateStart   = interaction.options.getString('date_start', true);
    const dateEnd     = interaction.options.getString('date_end', true);
    const durationH   = interaction.options.getInteger('duration', true);
    const windowStart = interaction.options.getString('window_start', true);
    const windowEnd   = interaction.options.getString('window_end', true);
    const timezone    = interaction.options.getString('timezone', true);
    const expiryHours = interaction.options.getInteger('expiry_hours') ?? 72;

    // Validate timezone
    if (!isValidTimezone(timezone)) {
      throw new AppError(`"${timezone}" is not a valid IANA timezone. Example: America/New_York`);
    }

    // Validate date range
    const startDate = DateTime.fromISO(dateStart, { zone: 'UTC' });
    const endDate   = DateTime.fromISO(dateEnd, { zone: 'UTC' });
    if (!startDate.isValid || !endDate.isValid) {
      throw new AppError('Invalid date format. Use YYYY-MM-DD.');
    }
    if (endDate < startDate) {
      throw new AppError('End date must be after start date.');
    }
    if (endDate.diff(startDate, 'days').days > 30) {
      throw new AppError('Date range cannot exceed 30 days.');
    }

    // Validate time window
    const [wsH, wsM] = windowStart.split(':').map(Number);
    const [weH, weM] = windowEnd.split(':').map(Number);
    if (isNaN(wsH) || isNaN(wsM) || isNaN(weH) || isNaN(weM)) {
      throw new AppError('Invalid time format. Use HH:MM (24-hour).');
    }
    const windowStartMin = wsH * 60 + wsM;
    const windowEndMin   = weH * 60 + weM;
    if (windowEndMin <= windowStartMin) {
      throw new AppError('Window end time must be after window start time.');
    }
    if ((windowEndMin - windowStartMin) < durationH * 60) {
      throw new AppError(`Daily window (${windowEnd} - ${windowStart}) must be at least ${durationH}h to fit a session.`);
    }

    // Check for existing active poll
    const pollService = new SchedulingPollService(db, client, config);
    const existing = pollService.getActivePollForGame(game.id);
    if (existing) {
      throw new AppError('There is already an active scheduling poll for this game. Use `/session schedule-end` to close it first.');
    }

    // Get game members
    const membershipService = new MembershipService(db);
    const members = membershipService.getMembers(game.id);
    const memberDiscordIds = members.map(m => m.userId);
    if (memberDiscordIds.length === 0) {
      throw new AppError('This game has no members yet. Add players first.');
    }

    // Create remote poll
    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    const remotePollId = await pollService.createPoll({
      gameId: game.id,
      gameName: game.title,
      guildId: config.guildId,
      memberDiscordIds,
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
      sessionDurationMinutes: durationH * 60,
      dailyWindowStart: windowStart,
      dailyWindowEnd: windowEnd,
      timezone,
      expiresAt,
    });

    // Insert local record
    const [localPoll] = db
      .insert(schedulingPolls)
      .values({
        gameId: game.id,
        remotePollId,
        status: 'collecting',
        expiresAt: expiresAt.getTime(),
        createdByUserId: interaction.user.id,
      })
      .returning()
      .all();

    // Post initial embed to game channel
    await pollService.postInitialEmbed(localPoll.id, game, memberDiscordIds.length);

    const pollUrl = `${process.env.STREAMING_RAINBOW_URL}/poll/${remotePollId}`;
    await interaction.editReply({
      content: `📅 Scheduling poll created!\n🔗 ${pollUrl}\n\nPosted to the channel. Poll closes in **${expiryHours}h** or when all ${memberDiscordIds.length} players vote.`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
