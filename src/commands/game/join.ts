import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { MembershipService } from '../../services/MembershipService';
import { GameService } from '../../services/GameService';
import { handleCommandError } from '../../utils/errors';

export const joinSubcommand = new SlashCommandSubcommandBuilder()
  .setName('join')
  .setDescription('Join a game')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleJoin(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const gameId = interaction.options.getInteger('game', true);
    const membershipService = new MembershipService(db, client);
    const gameService = new GameService(db, client);

    await membershipService.joinGame(gameId, interaction.user.id, interaction.user.id, config);

    const game = gameService.getGame(gameId);
    await interaction.editReply({
      content: `✅ You've joined **${game.title}**! ${game.discordRoleId ? `You now have the <@&${game.discordRoleId}> role.` : ''}`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
