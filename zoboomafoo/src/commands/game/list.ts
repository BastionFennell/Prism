import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder, EmbedBuilder, Colors, MessageFlags } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { MembershipService } from '../../services/MembershipService';
import { handleCommandError, AppError } from '../../utils/errors';
import { isFounder } from '../../permissions';

export const listSubcommand = new SlashCommandSubcommandBuilder()
  .setName('list')
  .setDescription('List all active games');

export async function handleList(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can use this command.');
    }

    const gameService = new GameService(db, client);
    const membershipService = new MembershipService(db);
    const games = gameService.listGames();

    const statusEmoji: Record<string, string> = { active: '🔵', paused: '🟡' };

    const embed = new EmbedBuilder().setTitle('🎮 Games').setColor(Colors.Blurple);

    if (games.length === 0) {
      embed.setDescription('No active games.');
    } else {
      const lines = games.map((g) => {
        const emoji = statusEmoji[g.status] ?? '❓';
        const system = g.systemName ? ` · ${g.systemName}` : '';
        const channel = g.discordChannelId ? ` · <#${g.discordChannelId}>` : '';
        const players = membershipService.getMemberCount(g.id);
        return `${emoji} **${g.title}**${system} — <@${g.gmUserId}> · ${players} player${players !== 1 ? 's' : ''}${channel}`;
      });
      embed.setDescription(lines.join('\n'));
    }

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
