import { Client, Events, MessageFlags } from 'discord.js';
import { loadConfig } from '../config';
import { commandHandlers } from '../commands';
import { handleButtonInteraction } from './buttons';
import { handleAutocomplete } from './autocomplete';

export function registerInteractionHandlers(client: Client): void {
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // Always load the freshest config — cached unless /admin setup invalidated it
      const config = await loadConfig();

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
