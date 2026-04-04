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

export const rescheduleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('reschedule')
  .setDescription('Reschedule a meeting to a new date/time (Founder only)')
  .addIntegerOption((o) =>
    o.setName('meeting').setDescription('Meeting to reschedule').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('date').setDescription('New date in YYYY-MM-DD format').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('time').setDescription('New start time in HH:MM (24-hour)').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('timezone').setDescription('IANA timezone (leave blank to keep original)').setRequired(false).setAutocomplete(true)
  );

export async function handleReschedule(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can reschedule meetings.');
    }

    const meetingId = interaction.options.getInteger('meeting', true);
    const dateStr   = interaction.options.getString('date', true);
    const timeStr   = interaction.options.getString('time', true);
    const newTz     = interaction.options.getString('timezone') ?? undefined;

    if (newTz && !isValidTimezone(newTz)) {
      throw new AppError(`"${newTz}" is not a valid IANA timezone.`);
    }

    const meetingService = new MeetingService(db);
    const meeting = meetingService.getMeeting(meetingId);
    const timezone = newTz ?? meeting.timezone;

    const startAt = parseSessionTime(dateStr, timeStr, timezone);
    const updated = meetingService.updateMeeting(meetingId, { startAt, timezone }, interaction.user.id);

    const embed = meetingEmbed(updated);
    await interaction.editReply({ content: '✅ Meeting rescheduled.', embeds: [embed] });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
