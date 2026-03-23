import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { SessionService } from '../../services/SessionService';
import { ScheduleService } from '../../services/ScheduleService';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { sessionEmbed } from '../../utils/embeds';
import { resolveGame } from '../../utils/context';

export const editSubcommand = new SlashCommandSubcommandBuilder()
  .setName('edit')
  .setDescription('Edit session details (Founder only)')
  .addIntegerOption((o) =>
    o.setName('session').setDescription('Session').setRequired(true).setAutocomplete(true)
  )
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  )
  .addStringOption((o) =>
    o.setName('title').setDescription('New title').setRequired(false)
  )
  .addIntegerOption((o) =>
    o.setName('duration').setDescription('New duration in minutes').setRequired(false).setMinValue(15)
  )
  .addStringOption((o) =>
    o.setName('notes').setDescription('New notes').setRequired(false)
  );

export async function handleEdit(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can edit sessions.');
    }

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);
    const sessionId = interaction.options.getInteger('session', true);
    const title = interaction.options.getString('title') ?? undefined;
    const duration = interaction.options.getInteger('duration') ?? undefined;
    const notes = interaction.options.getString('notes') ?? undefined;

    if (title === undefined && duration === undefined && notes === undefined) {
      throw new AppError('Provide at least one field to edit (title, duration, or notes).');
    }

    const sessionService = new SessionService(db);
    const updated = sessionService.updateSession(
      sessionId,
      { title, durationMinutes: duration, notes },
      interaction.user.id
    );

    const embed = sessionEmbed(updated, game.title);
    await interaction.editReply({ content: '✅ Session updated.', embeds: [embed] });

    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
    scheduleService.renderGameSchedule(game.id).catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
