import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { SessionService } from '../../services/SessionService';
import { isFounder } from '../../permissions';
import { handleCommandError } from '../../utils/errors';
import { gameInfoEmbed } from '../../utils/embeds';
import { AppError } from '../../utils/errors';

export const createSubcommand = new SlashCommandSubcommandBuilder()
  .setName('create')
  .setDescription('Create a new community game')
  .addStringOption((o) =>
    o.setName('title').setDescription('Game title (must be unique)').setRequired(true)
  )
  .addUserOption((o) =>
    o.setName('gm').setDescription('The GM or organizer').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('system').setDescription('Game system (e.g. D&D 5e, Pathfinder 2e)').setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('description').setDescription('Short pitch or description').setRequired(false)
  )
  .addIntegerOption((o) =>
    o.setName('player_cap').setDescription('Maximum number of players (optional)').setRequired(false).setMinValue(1)
  )
  .addStringOption((o) =>
    o.setName('status').setDescription('Initial status').setRequired(false)
      .addChoices(
        { name: 'Recruiting', value: 'recruiting' },
        { name: 'Active', value: 'active' }
      )
  );

export async function handleCreate(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can create games.');
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const title = interaction.options.getString('title', true);
    const gm = interaction.options.getUser('gm', true);
    const system = interaction.options.getString('system') ?? undefined;
    const description = interaction.options.getString('description') ?? undefined;
    const playerCap = interaction.options.getInteger('player_cap') ?? undefined;
    const status = (interaction.options.getString('status') ?? 'recruiting') as 'recruiting' | 'active';

    const gameService = new GameService(db, client);
    const sessionService = new SessionService(db);

    const game = await gameService.createGame(
      { title, gmUserId: gm.id, systemName: system, description, playerCap, status },
      interaction.user.id,
      config
    );

    const memberCount = gameService.getMemberCount(game.id, game.gmUserId);
    const nextSession = sessionService.getNextSession(game.id);
    const embed = gameInfoEmbed(game, memberCount, nextSession);

    await interaction.editReply({ content: `✅ Game **${game.title}** created!`, embeds: [embed] });

    // Trigger schedule re-render
    const { ScheduleService } = await import('../../services/ScheduleService');
    const scheduleService = new ScheduleService(db, client, config);
    scheduleService.renderSchedule().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
