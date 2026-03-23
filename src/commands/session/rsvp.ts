import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { RsvpService } from '../../services/RsvpService';
import { SessionService } from '../../services/SessionService';
import { GameService } from '../../services/GameService';
import { handleCommandError } from '../../utils/errors';
import { discordTimestamp } from '../../utils/time';

const responseLabel: Record<string, string> = { yes: 'Yes', no: 'No', maybe: 'Maybe' };
const responseEmoji: Record<string, string> = { yes: '✅', no: '❌', maybe: '❓' };

export const rsvpSubcommand = new SlashCommandSubcommandBuilder()
  .setName('rsvp')
  .setDescription('RSVP to a session')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption((o) =>
    o.setName('session').setDescription('Session').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o
      .setName('response')
      .setDescription('Your RSVP response')
      .setRequired(true)
      .addChoices(
        { name: '✅ Yes — I\'ll be there', value: 'yes' },
        { name: '❌ No — I can\'t make it', value: 'no' },
        { name: '❓ Maybe — not sure yet', value: 'maybe' }
      )
  );

export async function handleRsvp(
  interaction: ChatInputCommandInteraction,
  _config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sessionId = interaction.options.getInteger('session', true);
    const response  = interaction.options.getString('response', true) as 'yes' | 'no' | 'maybe';

    const rsvpService    = new RsvpService(db);
    const sessionService = new SessionService(db);
    const gameService    = new GameService(db, client);

    rsvpService.setRsvp(sessionId, interaction.user.id, response);

    const session = sessionService.getSession(sessionId);
    const game    = gameService.getGame(session.gameId);

    // Post to game thread
    if (game.discordThreadId) {
      try {
        const thread = await client.channels.fetch(game.discordThreadId);
        if (thread?.isThread()) {
          const emoji = responseEmoji[response];
          const label = responseLabel[response];
          const title = session.title ? `**${session.title}**` : `session on ${discordTimestamp(session.startAt, 'D')}`;
          await thread.send(`${emoji} <@${interaction.user.id}> RSVP'd **${label}** for ${title}`);
        }
      } catch {
        // Thread inaccessible — don't fail the RSVP itself
      }
    }

    await interaction.editReply({
      content: `${responseEmoji[response]} RSVP recorded: **${responseLabel[response]}**`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
