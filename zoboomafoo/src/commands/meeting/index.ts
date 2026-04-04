import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { addSubcommand, handleAdd } from './add';
import { scheduleSubcommand, handleSchedule } from './schedule';
import { scheduleEndSubcommand, handleScheduleEnd } from './schedule-end';
import { listSubcommand, handleList } from './list';
import { cancelSubcommand, handleCancel } from './cancel';
import { rescheduleSubcommand, handleReschedule } from './reschedule';

export const meetingCommandData = new SlashCommandBuilder()
  .setName('meeting')
  .setDescription('Schedule and manage founder meetings')
  .addSubcommand(addSubcommand)
  .addSubcommand(scheduleSubcommand)
  .addSubcommand(scheduleEndSubcommand)
  .addSubcommand(listSubcommand)
  .addSubcommand(cancelSubcommand)
  .addSubcommand(rescheduleSubcommand);

export async function handleMeetingCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const handlers: Record<string, (i: ChatInputCommandInteraction, c: AppConfig) => Promise<void>> = {
    add: handleAdd,
    schedule: handleSchedule,
    'schedule-end': handleScheduleEnd,
    list: handleList,
    cancel: handleCancel,
    reschedule: handleReschedule,
  };

  const handler = handlers[sub];
  if (handler) await handler(interaction, config);
}
