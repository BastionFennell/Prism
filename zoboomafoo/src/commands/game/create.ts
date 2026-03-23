import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { db } from '../../db';
import { client } from '../../client';
import { GameService } from '../../services/GameService';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const createSubcommand = new SlashCommandSubcommandBuilder()
  .setName('create')
  .setDescription('Create a new game — auto-creates channel and role, or link existing ones (Founder only)')
  .addStringOption((o) =>
    o.setName('name').setDescription('Game title').setRequired(true)
  )
  .addUserOption((o) =>
    o.setName('gm').setDescription('Game Master').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('system').setDescription('Game system (e.g. D&D 5e)').setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('description').setDescription('Short description').setRequired(false)
  )
  .addChannelOption((o) =>
    o.setName('channel').setDescription('Existing channel to link instead of auto-creating').setRequired(false)
  )
  .addRoleOption((o) =>
    o.setName('role').setDescription('Existing role to link instead of auto-creating').setRequired(false)
  );

export async function handleCreate(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    if (!isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can create games.');
    }

    const title = interaction.options.getString('name', true);
    const gm = interaction.options.getUser('gm', true);
    const systemName = interaction.options.getString('system') ?? undefined;
    const description = interaction.options.getString('description') ?? undefined;
    const channel = interaction.options.getChannel('channel') ?? undefined;
    const role = interaction.options.getRole('role') ?? undefined;

    const gameService = new GameService(db, client);
    const game = await gameService.createGame(
      { title, gmUserId: gm.id, systemName, description, channelId: channel?.id, roleId: role?.id },
      interaction.user.id,
      config
    );

    await interaction.editReply({
      content: `✅ **${game.title}** created! Channel: <#${game.discordChannelId}> · Role: <@&${game.discordRoleId}>`,
    });

    const { ScheduleService } = await import('../../services/ScheduleService');
    new ScheduleService(db, client, config).renderRoster().catch(console.error);
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
