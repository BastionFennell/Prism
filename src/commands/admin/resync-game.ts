import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const resyncGameSubcommand = new SlashCommandSubcommandBuilder()
  .setName('resync-game')
  .setDescription('Resync Discord role holders against bot membership records (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleResyncGame(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can run repair commands.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);
    const { added, removed } = await gameService.resyncGameRoles(gameId, interaction.user.id, config);

    await interaction.editReply({
      content:
        `✅ Resync complete for **${game.title}**:\n` +
        `• Roles added: ${added}\n` +
        `• Roles removed: ${removed}`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
