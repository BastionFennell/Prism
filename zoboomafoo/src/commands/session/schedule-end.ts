import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { SchedulingPollService } from '../../services/SchedulingPollService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { resolveGame } from '../../utils/context';

export const scheduleEndSubcommand = new SlashCommandSubcommandBuilder()
  .setName('schedule-end')
  .setDescription('End the availability collection phase early and post a vote (Founder only)')
  .addIntegerOption((o) =>
    o.setName('game').setDescription('Game name (defaults to this channel\'s game)').setRequired(false).setAutocomplete(true)
  );

export async function handleScheduleEnd(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can end scheduling polls.');
    }

    const gameService = new GameService(db, client);
    const game = resolveGame(interaction, gameService);

    const pollService = new SchedulingPollService(db, client, config);
    const poll = pollService.getActivePollForGame(game.id);
    if (!poll) {
      throw new AppError(`No active scheduling poll found for **${game.title}**.`);
    }

    await pollService.endCollection(poll.id);

    await interaction.editReply({
      content: '✅ Availability collection ended. Posting the time slot vote now...',
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
