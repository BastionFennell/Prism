import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { MeetingService } from '../../services/MeetingService';
import { ScheduleService } from '../../services/ScheduleService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const cancelSubcommand = new SlashCommandSubcommandBuilder()
  .setName('cancel')
  .setDescription('Cancel a scheduled meeting (Founder only)')
  .addIntegerOption((o) =>
    o.setName('meeting').setDescription('Meeting to cancel').setRequired(true).setAutocomplete(true)
  );

export async function handleCancel(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can cancel meetings.');
    }

    const meetingId = interaction.options.getInteger('meeting', true);

    const meetingService = new MeetingService(db);
    const meeting = meetingService.getMeeting(meetingId);
    meetingService.cancelMeeting(meetingId, interaction.user.id);

    await interaction.editReply({
      content: `✅ **${meeting.title}** has been canceled.`,
    });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
