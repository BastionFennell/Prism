import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { ScheduleService } from '../../services/ScheduleService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { resolveGame } from '../../utils/context';

export const addPlayerSubcommand = new SlashCommandSubcommandBuilder()
  .setName('add-player')
  .setDescription('Add a player to a game (Founder only)')
  .addUserOption((o) =>
    o.setName('player').setDescription('Player to add').setRequired(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
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

    const player = interaction.options.getUser('player', true);
    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);

    await gameService.addPlayer(game.id, player.id, interaction.user.id, config);

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderRoster().catch(console.error);

    await interaction.editReply({
      content: `✅ <@${player.id}> added to **${game.title}** and assigned <@&${game.discordRoleId}>.`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
