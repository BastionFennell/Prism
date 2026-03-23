import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { RsvpService } from '../../services/RsvpService';
import { SessionService } from '../../services/SessionService';
import { GameService } from '../../services/GameService';
import { MembershipService } from '../../services/MembershipService';
import { ScheduleService } from '../../services/ScheduleService';
import { handleCommandError } from '../../utils/errors';
import { discordTimestamp } from '../../utils/time';
import { resolveGame, requireMembership } from '../../utils/context';

const responseLabel: Record<string, string> = { yes: 'Yes', no: 'No', maybe: 'Maybe' };
const responseEmoji: Record<string, string> = { yes: '✅', no: '❌', maybe: '❓' };

export const rsvpSubcommand = new SlashCommandSubcommandBuilder()
  .setName('rsvp')
  .setDescription('RSVP to a session')
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
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  );

export async function handleRsvp(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const sessionId = interaction.options.getInteger('session', true);
    const response = interaction.options.getString('response', true) as 'yes' | 'no' | 'maybe';

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);
    requireMembership(interaction, game, new MembershipService(db), config);

    const rsvpService = new RsvpService(db);
    const sessionService = new SessionService(db);

    rsvpService.setRsvp(sessionId, interaction.user.id, response);

    const session = sessionService.getSession(sessionId);

    // Post to game channel
    if (game.discordChannelId) {
      try {
        const channel = await client.channels.fetch(game.discordChannelId);
        if (channel && 'send' in channel) {
          const emoji = responseEmoji[response];
          const label = responseLabel[response];
          const title = session.title ? `**${session.title}**` : `session on ${discordTimestamp(session.startAt, 'D')}`;
          await (channel as any).send(`${emoji} <@${interaction.user.id}> RSVP'd **${label}** for ${title}`);
        }
      } catch {
        // Channel inaccessible — don't fail the RSVP
      }
    }

    await interaction.editReply({
      content: `${responseEmoji[response]} RSVP recorded: **${responseLabel[response]}**`,
    });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
