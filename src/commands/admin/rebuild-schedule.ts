import {
  ChatInputCommandInteraction,
  MessageFlags,
  SlashCommandSubcommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
import { AppConfig } from '../../config';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { confirmEmbed } from '../../utils/embeds';

export const rebuildScheduleSubcommand = new SlashCommandSubcommandBuilder()
  .setName('rebuild-schedule')
  .setDescription('Rebuild the master schedule channel (Founder only)');

export async function handleRebuildSchedule(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can run repair commands.');
    }

    const embed = confirmEmbed(
      'Rebuild Schedule',
      `This will edit/replace all bot-owned messages in <#${config.scheduleChannelId}> with a fresh schedule render.\n\nProceed?`
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId('confirm:rebuild-schedule:0')
        .setLabel('Yes, rebuild it')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('cancel:rebuild-schedule:0')
        .setLabel('Cancel')
        .setStyle(ButtonStyle.Secondary)
    );

    await interaction.reply({ embeds: [embed], components: [row], flags: MessageFlags.Ephemeral });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
