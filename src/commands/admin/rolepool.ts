import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder, EmbedBuilder, Colors } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { RolePoolService } from '../../services/RolePoolService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const rolepoolSubcommand = new SlashCommandSubcommandBuilder()
  .setName('rolepool')
  .setDescription('Inspect the pooled role status (Founder only)');

export async function handleRolepool(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can inspect the role pool.');
    }

    const rolePoolService = new RolePoolService(db);
    const statuses = rolePoolService.getPoolStatus(config);

    if (statuses.length === 0) {
      await interaction.editReply({ content: 'No pooled roles configured. Run `/admin setup` first.' });
      return;
    }

    const lines = statuses.map((s) => {
      if (s.status === 'in_use') {
        return `🔴 <@&${s.roleId}> → **${s.gameTitle}** (Game ID: ${s.gameId})`;
      }
      return `🟢 <@&${s.roleId}> → AVAILABLE`;
    });

    const available = statuses.filter((s) => s.status === 'available').length;

    const embed = new EmbedBuilder()
      .setTitle(`Role Pool (${available}/${statuses.length} available)`)
      .setDescription(lines.join('\n'))
      .setColor(available > 0 ? Colors.Green : Colors.Red);

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
