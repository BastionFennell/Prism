import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const setRoleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('set-role')
  .setDescription('Link an existing Discord role to a game (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addRoleOption((o) =>
    o.setName('role').setDescription('Discord role to link').setRequired(true)
  );

export async function handleSetRole(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can set game roles.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const role = interaction.options.getRole('role', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    await gameService.setRole(gameId, role.id, interaction.user.id);

    await interaction.editReply({
      content: `✅ Role <@&${role.id}> linked to **${game.title}**.`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
