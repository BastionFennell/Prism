import { ContextMenuCommandBuilder, ApplicationCommandType } from 'discord.js';

export const scheduleAnnouncementCommandData = new ContextMenuCommandBuilder()
  .setName('Schedule Announcement')
  .setType(ApplicationCommandType.Message);

export const cancelAnnouncementCommandData = new ContextMenuCommandBuilder()
  .setName('Cancel Announcement')
  .setType(ApplicationCommandType.Message);
