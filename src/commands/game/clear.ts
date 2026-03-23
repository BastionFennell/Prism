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

export const clearSubcommand = new SlashCommandSubcommandBuilder()
  .setName('clear')
  .setDescription('Fully clear a game — removes all future sessions and roles (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleClear(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can clear a game.');
    }

    const embed = confirmEmbed(
      'Clear Game',
      `Are you sure you want to **fully clear** **${game.title}**?\n\n` +
      `This will:\n` +
      `• Remove the game role from all ${gameService.getMemberCount(game.id)} members\n` +
      `• Archive the game thread\n` +
      `• Release the pooled role back to the pool\n` +
      `• Mark all future sessions as canceled\n\n` +
      `Audit history is preserved. **This action cannot be undone.**`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:clear:${game.id}`)
        .setLabel('Yes, clear it')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel:clear:${game.id}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
