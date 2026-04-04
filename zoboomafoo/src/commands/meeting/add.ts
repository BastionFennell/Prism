import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { MeetingService } from '../../services/MeetingService';
import { ScheduleService } from '../../services/ScheduleService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { parseSessionTime, isValidTimezone } from '../../utils/time';
import { meetingEmbed } from '../../utils/embeds';

export const addSubcommand = new SlashCommandSubcommandBuilder()
  .setName('add')
  .setDescription('Schedule a meeting directly (Founder only)')
  .addStringOption((o) =>
    o.setName('date').setDescription('Date in YYYY-MM-DD format').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('time').setDescription('Start time in HH:MM (24-hour)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('timezone').setDescription('IANA timezone e.g. America/New_York').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('title').setDescription('Meeting title (default: Founder Team Meeting)').setRequired(false)
  )
  .addIntegerOption((o) =>
    o.setName('duration').setDescription('Duration in minutes').setRequired(false).setMinValue(15)
  );

export async function handleAdd(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can schedule meetings.');
    }

    if (!config.meetingChannelId) {
      throw new AppError('Meeting channel not configured. Run `/admin setup` with `meeting_channel` first.');
    }

    const dateStr  = interaction.options.getString('date', true);
    const timeStr  = interaction.options.getString('time', true);
    const timezone = interaction.options.getString('timezone', true);
    const title    = interaction.options.getString('title') ?? 'Founder Team Meeting';
    const duration = interaction.options.getInteger('duration') ?? undefined;

    if (!isValidTimezone(timezone)) {
      throw new AppError(`"${timezone}" is not a valid IANA timezone. Example: America/New_York`);
    }

    const startAt = parseSessionTime(dateStr, timeStr, timezone);

    const meetingService = new MeetingService(db);
    const meeting = meetingService.createMeeting(
      { title, startAt, durationMinutes: duration, timezone },
      interaction.user.id
    );

    const embed = meetingEmbed(meeting);
    await interaction.editReply({ content: '✅ Meeting scheduled!', embeds: [embed] });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.postMeetingAnnouncement(meeting).catch(console.error);
    scheduleService.renderSchedule().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
