import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder, EmbedBuilder, Colors } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { SessionService } from '../../services/SessionService';
import { MembershipService } from '../../services/MembershipService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { discordTimestamp } from '../../utils/time';

export const inspectGameSubcommand = new SlashCommandSubcommandBuilder()
  .setName('inspect-game')
  .setDescription('Show full internal state of a game (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleInspectGame(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can inspect game state.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const sessionService = new SessionService(db);
    const membershipService = new MembershipService(db, client);

    const game = gameService.getGame(gameId);
    const members = membershipService.getActiveMembers(gameId);
    const upcomingSessions = sessionService.getUpcomingSessions(gameId);
    const allSessions = sessionService.listSessionsForGame(gameId);

    const embed = new EmbedBuilder()
      .setTitle(`🔍 Inspect: ${game.title}`)
      .setColor(Colors.Yellow)
      .addFields(
        { name: 'Status', value: game.status, inline: true },
        { name: 'GM User ID', value: game.gmUserId, inline: true },
        { name: 'System', value: game.systemName ?? 'N/A', inline: true },
        { name: 'Player Cap', value: game.playerCap != null ? `${game.playerCap}` : 'None', inline: true },
        { name: 'Members (active)', value: `${members.length}`, inline: true },
        { name: 'Discord Role', value: game.discordRoleId ? `<@&${game.discordRoleId}>` : 'None', inline: true },
        { name: 'Discord Thread', value: game.discordThreadId ? `<#${game.discordThreadId}>` : 'None', inline: true },
        { name: 'Sessions (total/upcoming)', value: `${allSessions.length} / ${upcomingSessions.length}`, inline: true },
        { name: 'Created At', value: discordTimestamp(game.createdAt, 'F'), inline: true },
        { name: 'Updated At', value: discordTimestamp(game.updatedAt, 'F'), inline: true },
      );

    if (game.archivedAt) {
      embed.addFields({ name: 'Archived At', value: discordTimestamp(game.archivedAt, 'F'), inline: true });
    }
    if (game.clearedAt) {
      embed.addFields({ name: 'Cleared At', value: discordTimestamp(game.clearedAt, 'F'), inline: true });
    }

    if (members.length > 0) {
      embed.addFields({ name: 'Active Members', value: members.map((id) => `<@${id}>`).join(', ').slice(0, 1000) });
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
