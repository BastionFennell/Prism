import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const addPlayerSubcommand = new SlashCommandSubcommandBuilder()
  .setName('add-player')
  .setDescription('Add a player to a game (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addUserOption((o) =>
    o.setName('player').setDescription('Player to add').setRequired(true)
  );

export async function handleAddPlayer(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can add players to games.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const player = interaction.options.getUser('player', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    await gameService.addPlayer(gameId, player.id, interaction.user.id, config);

    await interaction.editReply({
      content: `✅ <@${player.id}> added to **${game.title}** and assigned <@&${game.discordRoleId}>.`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
