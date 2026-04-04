import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { MeetingPollService } from '../../services/MeetingPollService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const scheduleEndSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-end')
  .setDescription('End the meeting availability collection early and post a vote (Founder only)');

export async function handleScheduleEnd(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can end meeting polls.');
    }

    const pollService = new MeetingPollService(db, client, config);
    const poll = pollService.getActivePoll();
    if (!poll) {
      throw new AppError('No active meeting scheduling poll found.');
    }

    await pollService.endCollection(poll.id);

    await interaction.editReply({
      content: '✅ Availability collection ended. Posting the time slot vote now...',
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
