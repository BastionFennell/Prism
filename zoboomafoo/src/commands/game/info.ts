import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder, MessageFlags } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { MembershipService } from '../../services/MembershipService';
import { SessionService } from '../../services/SessionService';
import { handleCommandError, AppError } from '../../utils/errors';
import { gameInfoEmbed } from '../../utils/embeds';
import { resolveGame } from '../../utils/context';
import { isFounder } from '../../permissions';

export const infoSubcommand = new SlashCommandSubcommandBuilder()
  .setName('info')
  .setDescription('Show info for a game')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  );

export async function handleInfo(
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

    const membershipService = new MembershipService(db);
    const sessionService = new SessionService(db);

    const memberCount = membershipService.getMemberCount(game.id);
    const nextSession = sessionService.getNextSession(game.id);

    const embed = gameInfoEmbed(game, memberCount, nextSession);
    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
