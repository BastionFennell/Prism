import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder, EmbedBuilder, Colors, MessageFlags } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { RsvpService } from '../../services/RsvpService';
import { SessionService } from '../../services/SessionService';
import { GameService } from '../../services/GameService';
import { handleCommandError, AppError } from '../../utils/errors';
import { discordTimestamp } from '../../utils/time';
import { resolveGame } from '../../utils/context';
import { isFounder } from '../../permissions';

export const attendanceSubcommand = new SlashCommandSubcommandBuilder()
  .setName('attendance')
  .setDescription('View RSVP breakdown for a session')
  .addIntegerOption((o) =>
    o.setName('session').setDescription('Session').setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  );

export async function handleAttendance(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can use this command.');
    }

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);
    const sessionId = interaction.options.getInteger('session', true);

    const rsvpService = new RsvpService(db);
    const sessionService = new SessionService(db);

    const session = sessionService.getSession(sessionId);
    const allRsvps = rsvpService.getRsvps(sessionId);
    const counts = rsvpService.getRsvpCounts(sessionId);

    const yes   = allRsvps.filter((r) => r.response === 'yes').map((r) => `<@${r.userId}>`).join(', ') || '—';
    const no    = allRsvps.filter((r) => r.response === 'no').map((r) => `<@${r.userId}>`).join(', ') || '—';
    const maybe = allRsvps.filter((r) => r.response === 'maybe').map((r) => `<@${r.userId}>`).join(', ') || '—';

    const embed = new EmbedBuilder()
      .setTitle(`📋 Attendance — ${session.title ?? 'Session'}`)
      .setDescription(`**${game.title}** · ${discordTimestamp(session.startAt, 'F')}`)
      .setColor(Colors.Blurple)
      .addFields(
        { name: `✅ Yes (${counts.yes})`, value: yes, inline: false },
        { name: `❌ No (${counts.no})`, value: no, inline: false },
        { name: `❓ Maybe (${counts.maybe})`, value: maybe, inline: false }
      );

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
