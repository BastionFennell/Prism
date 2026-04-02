import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { MembershipService } from '../../services/MembershipService';
import { GameService } from '../../services/GameService';
import { handleCommandError } from '../../utils/errors';

export const leaveSubcommand = new SlashCommandSubcommandBuilder()
  .setName('leave')
  .setDescription('Leave a game')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleLeave(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameId = interaction.options.getInteger('game', true);
    const membershipService = new MembershipService(db, client);
    const gameService = new GameService(db, client);

    await membershipService.leaveGame(gameId, interaction.user.id, interaction.user.id, config);

    const game = gameService.getGame(gameId);
    await interaction.editReply({ content: `✅ You've left **${game.title}**.` });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
