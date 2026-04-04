import { ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';

export const scheduleAnnouncementCommandData = new ContextMenuCommandBuilder()
  .setName('Schedule Announcement')
  .setType(ApplicationCommandType.Message);

export const cancelAnnouncementCommandData = new ContextMenuCommandBuilder()
  .setName('Cancel Announcement')
  .setType(ApplicationCommandType.Message);

export const rescheduleAnnouncementCommandData = new ContextMenuCommandBuilder()
  .setName('Reschedule Announcement')
  .setType(ApplicationCommandType.Message);

export const getFeedbackCommandData = new ContextMenuCommandBuilder()
  .setName('Get Feedback')
  .setType(ApplicationCommandType.Message);
