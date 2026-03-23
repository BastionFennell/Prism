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
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { confirmEmbed } from '../../utils/embeds';

export const deleteGameSubcommand = new SlashCommandSubcommandBuilder()
  .setName('delete-game')
  .setDescription('Permanently delete a game and all its records (Founder only — irreversible)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleDeleteGame(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can delete games.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    const embed = confirmEmbed(
      'Delete Game',
      `Are you sure you want to **permanently delete** **${game.title}**?\n\n` +
      `This will remove:\n` +
      `• The game record\n` +
      `• All ${gameService.getMemberCount(game.id)} memberships\n` +
      `• All sessions and audit logs\n` +
      `• The game role from all members\n\n` +
      `**This cannot be undone. There is no recovery.**`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:delete-game:${game.id}`)
        .setLabel('Yes, permanently delete it')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel:delete-game:${game.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
