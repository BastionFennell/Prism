import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { meetingPolls } from '../../db/schema';
import { MeetingPollService } from '../../services/MeetingPollService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { isValidTimezone } from '../../utils/time';
import { DateTime } from 'luxon';

export const scheduleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule')
  .setDescription('Create an availability poll to find a meeting time (Founder only)')
  .addStringOption((o) =>
    o.setName('date_start').setDescription('Poll start date (YYYY-MM-DD)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('date_end').setDescription('Poll end date (YYYY-MM-DD)').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('duration').setDescription('Meeting length in hours').setRequired(true).setMinValue(1).setMaxValue(8)
  )
  .addStringOption((o) =>
    o.setName('window_start').setDescription('Earliest daily start time (HH:MM, 24-hour)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('window_end').setDescription('Latest daily end time (HH:MM, 24-hour)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('timezone').setDescription('Timezone for the meeting window').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('title').setDescription('Meeting title (default: Founder Team Meeting)').setRequired(false)
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
      throw new AppError('Only Founders can create meeting polls.');
    }

    if (!config.meetingChannelId) {
      throw new AppError('Meeting channel not configured. Run `/admin setup` with `meeting_channel` first.');
    }

    const dateStart   = interaction.options.getString('date_start', true);
    const dateEnd     = interaction.options.getString('date_end', true);
    const durationH   = interaction.options.getInteger('duration', true);
    const windowStart = interaction.options.getString('window_start', true);
    const windowEnd   = interaction.options.getString('window_end', true);
    const timezone    = interaction.options.getString('timezone', true);
    const title       = interaction.options.getString('title') ?? 'Founder Team Meeting';
    const expiryHours = interaction.options.getInteger('expiry_hours') ?? 72;

    if (!isValidTimezone(timezone)) {
      throw new AppError(`"${timezone}" is not a valid IANA timezone. Example: America/New_York`);
    }

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
      throw new AppError(`Daily window (${windowEnd} - ${windowStart}) must be at least ${durationH}h to fit the meeting.`);
    }

    const pollService = new MeetingPollService(db, client, config);
    const existing = pollService.getActivePoll();
    if (existing) {
      throw new AppError('There is already an active meeting scheduling poll. Use `/meeting schedule-end` to close it first.');
    }

    // Fetch founder members from the guild
    const guild = await client.guilds.fetch(config.guildId);
    await guild.members.fetch(); // ensure member cache is populated
    const founderRole = await guild.roles.fetch(config.founderRoleId);
    if (!founderRole) {
      throw new AppError('Founder role not found in guild.');
    }
    const memberDiscordIds = [...founderRole.members.values()].map(m => m.id);
    if (memberDiscordIds.length === 0) {
      throw new AppError('No members found with the Founder role.');
    }

    const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    const remotePollId = await pollService.createPoll({
      title,
      guildId: config.guildId,
      memberDiscordIds,
      dateRangeStart: dateStart,
      dateRangeEnd: dateEnd,
      meetingDurationMinutes: durationH * 60,
      dailyWindowStart: windowStart,
      dailyWindowEnd: windowEnd,
      timezone,
      expiresAt,
    });

    const [localPoll] = db
      .insert(meetingPolls)
      .values({
        remotePollId,
        status: 'collecting',
        expiresAt: expiresAt.getTime(),
        createdByUserId: interaction.user.id,
      })
      .returning()
      .all();

    await pollService.postInitialEmbed(localPoll.id, title, memberDiscordIds.length);

    const pollUrl = `${process.env.STREAMING_RAINBOW_URL}/poll/${remotePollId}`;
    await interaction.editReply({
      content: `📅 Meeting scheduling poll created!\n🔗 ${pollUrl}\n\nPosted to the meeting channel. Poll closes in **${expiryHours}h** or when all ${memberDiscordIds.length} founders vote.`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
