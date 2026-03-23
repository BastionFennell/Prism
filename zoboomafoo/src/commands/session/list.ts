import { ChatInputCommandInteraction, SlashCommandSubcommandBuilder, EmbedBuilder, Colors, MessageFlags } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { SessionService } from '../../services/SessionService';
import { GameService } from '../../services/GameService';
import { handleCommandError, AppError } from '../../utils/errors';
import { discordTimestamp } from '../../utils/time';
import { resolveGame } from '../../utils/context';
import { isFounder } from '../../permissions';

export const listSubcommand = new SlashCommandSubcommandBuilder()
  .setName('list')
  .setDescription('List sessions for a game')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  )
  .addBooleanOption((o) =>
    o.setName('all').setDescription('Include past sessions').setRequired(false)
  );

const statusEmoji: Record<string, string> = {
  scheduled: '🗓',
  canceled:  '❌',
  completed: '✅',
};

export async function handleList(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can use this command.');
    }

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);
    const showAll = interaction.options.getBoolean('all') ?? false;

    const sessionService = new SessionService(db);
    const allSessions = showAll
      ? sessionService.listSessionsForGame(game.id)
      : sessionService.getUpcomingSessions(game.id);

    if (allSessions.length === 0) {
      await interaction.editReply({ content: `No ${showAll ? '' : 'upcoming '}sessions for **${game.title}**.` });
      return;
    }

    const lines = allSessions.slice(0, 15).map((s) => {
      const emoji = statusEmoji[s.status] ?? '❓';
      const time = discordTimestamp(s.startAt, 'F');
      return `${emoji} **${s.title ?? 'Session'}** — ${time}`;
    });

    const embed = new EmbedBuilder()
      .setTitle(`${game.title} — Sessions`)
      .setDescription(lines.join('\n'))
      .setColor(Colors.Blurple)
      .setFooter({ text: allSessions.length > 15 ? `Showing first 15 of ${allSessions.length}` : `${allSessions.length} session(s)` });

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
