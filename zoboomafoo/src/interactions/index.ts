import { Client, Events, MessageFlags } from 'discord.js';
import { loadConfig } from '../config';
import { commandHandlers } from '../commands';
import { handleButtonInteraction } from './buttons';
import { handleAutocomplete } from './autocomplete';
import { handleReactionAdd, handleReactionRemove } from './reactions';
import { handleMention } from './mentions';
import type { SchedulingPollService } from '../services/SchedulingPollService';

let schedulingPollService: SchedulingPollService | null = null;

export function setSchedulingPollService(svc: SchedulingPollService): void {
  schedulingPollService = svc;
}

export function registerInteractionHandlers(client: Client): void {
  client.on(Events.MessagePollVoteAdd, (pollAnswer) => {
    schedulingPollService?.handlePollVote(pollAnswer as any).catch(console.error);
  });
  client.on(Events.MessageCreate, (message) => {
    handleMention(message).catch(console.error);
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
