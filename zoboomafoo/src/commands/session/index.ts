import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { addSubcommand, handleAdd } from './add';
import { editSubcommand, handleEdit } from './edit';
import { rescheduleSubcommand, handleReschedule } from './reschedule';
import { cancelSubcommand, handleCancel } from './cancel';
import { completeSubcommand, handleComplete } from './complete';
import { listSubcommand, handleList } from './list';
import { rsvpSubcommand, handleRsvp } from './rsvp';
import { attendanceSubcommand, handleAttendance } from './attendance';
import { scheduleSubcommand, handleSchedule } from './schedule';
import { scheduleEndSubcommand, handleScheduleEnd } from './schedule-end';

export const sessionCommandData = new SlashCommandBuilder()
  .setName('session')
  .setDescription('Manage game sessions')
  .addSubcommand(addSubcommand)
  .addSubcommand(editSubcommand)
  .addSubcommand(rescheduleSubcommand)
  .addSubcommand(cancelSubcommand)
  .addSubcommand(completeSubcommand)
  .addSubcommand(listSubcommand)
  .addSubcommand(rsvpSubcommand)
  .addSubcommand(attendanceSubcommand)
  .addSubcommand(scheduleSubcommand)
  .addSubcommand(scheduleEndSubcommand);

export async function handleSessionCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const handlers: Record<string, (i: ChatInputCommandInteraction, c: AppConfig) => Promise<void>> = {
    add: handleAdd,
    edit: handleEdit,
    reschedule: handleReschedule,
    cancel: handleCancel,
    complete: handleComplete,
    list: handleList,
    rsvp: handleRsvp,
    attendance: handleAttendance,
    schedule: handleSchedule,
    'schedule-end': handleScheduleEnd,
  };

  const handler = handlers[sub];
  if (handler) await handler(interaction, config);
}
