import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder, EmbedBuilder, Colors, MessageFlags } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { MeetingService } from '../../services/MeetingService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { discordTimestamp } from '../../utils/time';

export const listSubcommand = new SlashCommandSubcommandBuilder()
  .setName('list')
  .setDescription('List upcoming meetings');

export async function handleList(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can use this command.');
    }

    const meetingService = new MeetingService(db);
    const upcoming = meetingService.getUpcomingMeetings();

    if (upcoming.length === 0) {
      await interaction.editReply({ content: 'No upcoming meetings.' });
      return;
    }

    const lines = upcoming.slice(0, 15).map((m) => {
      const time = discordTimestamp(m.startAt, 'F');
      return `🗓 **${m.title}** — ${time}`;
    });

    const embed = new EmbedBuilder()
      .setTitle('Upcoming Meetings')
      .setDescription(lines.join('\n'))
      .setColor(Colors.DarkGreen)
      .setFooter({ text: `${upcoming.length} meeting(s)` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
