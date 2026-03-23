import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandSubcommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { MembershipService } from '../../services/MembershipService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { confirmEmbed } from '../../utils/embeds';

export const removePlayerSubcommand = new SlashCommandSubcommandBuilder()
  .setName('remove-player')
  .setDescription('Remove a player from a game (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addUserOption((o) =>
    o.setName('player').setDescription('Player to remove').setRequired(true)
  );

export async function handleRemovePlayer(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can remove players from games.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const player = interaction.options.getUser('player', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    const membershipService = new MembershipService(db);
    if (!membershipService.isMember(gameId, player.id)) {
      throw new AppError(`<@${player.id}> is not in **${game.title}**.`);
    }

    const embed = confirmEmbed(
      'Remove Player',
      `Remove <@${player.id}> from **${game.title}**?\n\nThis will remove their game role and deactivate their membership.`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:remove-player:${gameId}:${player.id}`)
        .setLabel('Yes, remove them')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel:remove-player:${gameId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
