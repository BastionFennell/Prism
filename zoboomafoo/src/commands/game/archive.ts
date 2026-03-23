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

export const archiveSubcommand = new SlashCommandSubcommandBuilder()
  .setName('archive')
  .setDescription('Archive a game — releases roles and archives channel (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  );

export async function handleArchive(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can archive games.');
    }

    const gameId = interaction.options.getInteger('game', true);
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);
    const memberCount = new MembershipService(db).getMemberCount(gameId);

    const embed = confirmEmbed(
      'Archive Game',
      `Are you sure you want to archive **${game.title}**?\n\n` +
      `This will:\n` +
      `• Remove the game role from all ${memberCount} members\n` +
      `• Move the channel to the archived category\n` +
      `• Cancel all scheduled sessions\n\n` +
      `**This action cannot be undone.**`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`confirm:archive:${gameId}`)
        .setLabel('Yes, archive it')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`cancel:archive:${gameId}`)
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
