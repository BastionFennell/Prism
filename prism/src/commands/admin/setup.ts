import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig, invalidateConfig } from '../../config';
import { db } from '../../db';
import { botConfig } from '../../db/schema';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';

export const setupSubcommand = new SlashCommandSubcommandBuilder()
  .setName('setup')
  .setDescription('Configure the bot for this server (Founder only)')
  .addRoleOption((o) =>
    o.setName('founder_role').setDescription('The Founder role').setRequired(true)
  )
  .addChannelOption((o) =>
    o.setName('games_channel').setDescription('Channel where game threads are created').setRequired(true)
  )
  .addChannelOption((o) =>
    o.setName('schedule_channel').setDescription('Channel for the master schedule').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('pooled_roles').setDescription('Comma-separated role IDs for the community pool').setRequired(true)
  )
  .addStringOption((o) =>
    o.setName('timezone').setDescription('Default timezone (IANA, e.g. America/New_York)').setRequired(false)
  );

export async function handleSetup(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    // For setup, we only check the token since config may be empty
    if (interaction.guild?.ownerId !== interaction.user.id && !isFounder(interaction.member!, config)) {
      throw new AppError('Only the server owner or a Founder can run setup.');
    }

    const founderRole = interaction.options.getRole('founder_role', true);
    const gamesChannel = interaction.options.getChannel('games_channel', true);
    const scheduleChannel = interaction.options.getChannel('schedule_channel', true);
    const pooledRolesRaw = interaction.options.getString('pooled_roles', true);
    const timezone = interaction.options.getString('timezone') ?? 'UTC';

    const pooledRoleIds = pooledRolesRaw
      .split(',')
      .map((s) => s.trim().replace(/^<@&(\d+)>$/, '$1'))
      .filter(Boolean);

    if (pooledRoleIds.length === 0) {
      throw new AppError('Provide at least one pooled role ID.');
    }

    const guildId = interaction.guildId!;

    // Upsert bot_config (always id = 1)
    const existing = db.select().from(botConfig).all();
    if (existing.length > 0) {
      db.update(botConfig)
        .set({
          guildId,
          founderRoleId: founderRole.id,
          gamesChannelId: gamesChannel.id,
          scheduleChannelId: scheduleChannel.id,
          defaultTimezone: timezone,
          pooledRoleIds: JSON.stringify(pooledRoleIds),
        })
        .run();
    } else {
      db.insert(botConfig)
        .values({
          id: 1,
          guildId,
          founderRoleId: founderRole.id,
          gamesChannelId: gamesChannel.id,
          scheduleChannelId: scheduleChannel.id,
          defaultTimezone: timezone,
          pooledRoleIds: JSON.stringify(pooledRoleIds),
        })
        .run();
    }

    invalidateConfig();

    await interaction.editReply({
      content:
        `✅ Bot configured!\n` +
        `• Founder role: <@&${founderRole.id}>\n` +
        `• Games channel: <#${gamesChannel.id}>\n` +
        `• Schedule channel: <#${scheduleChannel.id}>\n` +
        `• Pooled roles: ${pooledRoleIds.length}\n` +
        `• Default timezone: ${timezone}`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
