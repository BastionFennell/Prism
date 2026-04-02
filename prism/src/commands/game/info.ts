import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { SessionService } from '../../services/SessionService';
import { handleCommandError, AppError } from '../../utils/errors';
import { gameInfoEmbed } from '../../utils/embeds';

export const infoSubcommand = new SlashCommandSubcommandBuilder()
  .setName('info')
  .setDescription('Show info about a game')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleInfo(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply();

    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const sessionService = new SessionService(db);

    const game = gameService.getGame(gameId);
    const memberCount = gameService.getMemberCount(game.id, game.gmUserId);
    const nextSession = sessionService.getNextSession(game.id);
    const embed = gameInfoEmbed(game, memberCount, nextSession);

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
