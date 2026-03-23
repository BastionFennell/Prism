import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder, EmbedBuilder, Colors } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { handleCommandError } from '../../utils/errors';

export const listSubcommand = new SlashCommandSubcommandBuilder()
  .setName('list')
  .setDescription('List all active games')
  .addBooleanOption((o) =>
    o.setName('include_archived').setDescription('Include archived/cleared games').setRequired(false)
  );

const statusEmoji: Record<string, string> = {
  recruiting: '🟢',
  active: '🔵',
  paused: '🟡',
  archived: '⚫',
  cleared: '🔴',
};

export async function handleList(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply();

    const includeArchived = interaction.options.getBoolean('include_archived') ?? false;
    const gameService = new GameService(db, client);
    const allGames = gameService.listGames(includeArchived);

    if (allGames.length === 0) {
      await interaction.editReply({ content: 'No games found.' });
      return;
    }

    const lines = allGames.map((g) => {
      const emoji = statusEmoji[g.status] ?? '❓';
      const system = g.systemName ? ` · ${g.systemName}` : '';
      const cap = g.playerCap ? ` (cap: ${g.playerCap})` : '';
      return `${emoji} **${g.title}**${system} — <@${g.gmUserId}>${cap}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`Community Games (${allGames.length})`)
      .setDescription(lines.join('\n'))
      .setColor(Colors.Blurple);

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
