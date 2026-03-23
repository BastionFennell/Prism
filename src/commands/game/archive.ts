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
import { canManageGame } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { confirmEmbed } from '../../utils/embeds';

export const archiveSubcommand = new SlashCommandSubcommandBuilder()
  .setName('archive')
  .setDescription('Archive a game — keeps history but removes role from all players (Founder or GM only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleArchive(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    if (!canManageGame(interaction.member!, game, config)) {
      throw new AppError('Only Founders or the game GM can archive a game.');
    }

    const embed = confirmEmbed(
      'Archive Game',
      `Are you sure you want to archive **${game.title}**?\n\n` +
      `This will:\n` +
      `• Remove the game role from all ${gameService.getMemberCount(game.id)} members\n` +
      `• Archive the game thread\n` +
      `• Release the pooled role back to the pool\n\n` +
      `Game history and session records are preserved.`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:archive:${game.id}`)
        .setLabel('Yes, archive it')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel:archive:${game.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
