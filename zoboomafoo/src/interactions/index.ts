import { Client, Events, MessageFlags } from 'discord.js';
import { loadConfig } from '../config';
import { commandHandlers } from '../commands';
import { handleButtonInteraction } from './buttons';
import { handleAutocomplete } from './autocomplete';
import { handleReactionAdd, handleReactionRemove } from './reactions';
import { handleMention } from './mentions';
import { handleScheduleAnnouncementContext, handleScheduleAnnouncementModal, handleCancelAnnouncementContext, handleRescheduleAnnouncementContext, handleRescheduleAnnouncementModal } from './scheduleAnnouncement';
import { handleGetFeedbackContext, handleFeedbackThreadMessage } from './feedback';
import type { SchedulingPollService } from '../services/SchedulingPollService';
import type { MeetingPollService } from '../services/MeetingPollService';

let schedulingPollService: SchedulingPollService | null = null;
let meetingPollService: MeetingPollService | null = null;

export function setSchedulingPollService(svc: SchedulingPollService): void {
  schedulingPollService = svc;
}

export function setMeetingPollService(svc: MeetingPollService): void {
  meetingPollService = svc;
}

export function registerInteractionHandlers(client: Client): void {
  client.on(Events.MessagePollVoteAdd, (pollAnswer) => {
    schedulingPollService?.handlePollVote(pollAnswer as any).catch(console.error);
    meetingPollService?.handlePollVote(pollAnswer as any).catch(console.error);
  });
  client.on(Events.MessageCreate, (message) => {
    handleMention(message).catch(console.error);
    handleFeedbackThreadMessage(message).catch(console.error);
  });

  client.on(Events.MessageReactionAdd, (reaction, user) => {
    handleReactionAdd(reaction, user).catch(console.error);
  });

  client.on(Events.MessageReactionRemove, (reaction, user) => {
    handleReactionRemove(reaction, user).catch(console.error);
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      const config = loadConfig();

      if (interaction.isChatInputCommand()) {
        const handler = commandHandlers.get(interaction.commandName);
        if (!handler) return;
        await handler(interaction, config);

      } else if (interaction.isMessageContextMenuCommand()) {
        if (interaction.commandName === 'Schedule Announcement') {
          await handleScheduleAnnouncementContext(interaction, config);
        } else if (interaction.commandName === 'Cancel Announcement') {
          await handleCancelAnnouncementContext(interaction, config);
        } else if (interaction.commandName === 'Reschedule Announcement') {
          await handleRescheduleAnnouncementContext(interaction, config);
        } else if (interaction.commandName === 'Get Feedback') {
          await handleGetFeedbackContext(interaction);
        }

      } else if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('announce-schedule:')) {
          await handleScheduleAnnouncementModal(interaction, config);
        } else if (interaction.customId.startsWith('announce-reschedule:')) {
          await handleRescheduleAnnouncementModal(interaction, config);
        }

      } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction, config);

      } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction, config);
      }
    } catch (err) {
      console.error('[interactions] Unhandled interaction error:', err);

      if ('reply' in interaction && typeof interaction.reply === 'function') {
        try {
          await (interaction as any).reply({
            content: '❌ An unexpected error occurred.',
            flags: MessageFlags.Ephemeral,
          });
        } catch {
          // Already replied
        }
      }
    }
  });
}
