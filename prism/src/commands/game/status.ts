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

export const statusSubcommand = new SlashCommandSubcommandBuilder()
  .setName('status')
  .setDescription('Update the status of a game (Founder or GM only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name').setRequired(true).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o
      .setName('status')
      .setDescription('New status')
      .setRequired(true)
      .addChoices(
        { name: '🟢 Recruiting — open to new players', value: 'recruiting' },
        { name: '🔵 Active — recruitment closed', value: 'active' },
        { name: '🏁 Finished — game has concluded', value: 'finished' }
      )
  );

export async function handleStatus(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    const gameId = interaction.options.getInteger('game', true);
    const newStatus = interaction.options.getString('status', true) as 'recruiting' | 'active' | 'finished';
    const gameService = new GameService(db, client);
    const game = gameService.getGame(gameId);

    if (!canManageGame(interaction.member!, game, config)) {
      throw new AppError('Only Founders or the game GM can change game status.');
    }

    if (game.status === newStatus) {
      throw new AppError(`**${game.title}** is already ${newStatus}.`);
    }

    // Finishing requires a confirmation prompt (destructive)
    if (newStatus === 'finished') {
      const embed = confirmEmbed(
        'Finish Game',
        `Are you sure you want to mark **${game.title}** as finished?\n\n` +
        `This will:\n` +
        `• Remove the game role from all ${gameService.getMemberCount(game.id)} members\n` +
        `• Archive the game thread\n` +
        `• Release the pooled role back to the pool\n\n` +
        `**This action cannot be undone.**`
      );

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm:finish:${game.id}`)
          .setLabel('Yes, finish it')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`cancel:finish:${game.id}`)
          .setLabel('Cancel')
          .setStyle(ButtonStyle.Secondary)
      );

      await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await gameService.setStatus(gameId, newStatus, interaction.user.id, config);

    const message = newStatus === 'active'
      ? `🔵 Recruitment closed for **${game.title}**. The game is now active.`
      : `🟢 **${game.title}** is now recruiting again.`;

    await interaction.editReply({ content: message });

    const { ScheduleService } = await import('../../services/ScheduleService');
    new ScheduleService(db, client, config).renderRoster().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
