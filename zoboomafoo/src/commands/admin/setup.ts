import { ChatInputCommandInteraction, MessageFlags, SlashCommandSubcommandBuilder } from 'discord.js';
import { AppConfig, invalidateConfig } from '../../config';
import { db } from '../../db';
import { botConfig } from '../../db/schema';
import { eq } from 'drizzle-orm';
import { isFounder } from '../../permissions';
import { handleCommandError, AppError } from '../../utils/errors';
import { isValidTimezone } from '../../utils/time';

export const setupSubcommand = new SlashCommandSubcommandBuilder()
  .setName('setup')
  .setDescription('Configure bot settings (Founder only)')
  .addStringOption((o) =>
    o.setName('guild_id').setDescription('Discord Guild/Server ID').setRequired(false)
  )
  .addRoleOption((o) =>
    o.setName('founder_role').setDescription('Founder role').setRequired(false)
  )
  .addChannelOption((o) =>
    o.setName('games_category').setDescription('Category for active game channels').setRequired(false)
  )
  .addChannelOption((o) =>
    o.setName('archived_category').setDescription('Category for archived game channels').setRequired(false)
  )
  .addChannelOption((o) =>
    o.setName('schedule_channel').setDescription('Global schedule channel').setRequired(false)
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

    const guildId           = interaction.options.getString('guild_id') ?? undefined;
    const founderRole       = interaction.options.getRole('founder_role') ?? undefined;
    const gamesCategory     = interaction.options.getChannel('games_category') ?? undefined;
    const archivedCategory  = interaction.options.getChannel('archived_category') ?? undefined;
    const scheduleChannel   = interaction.options.getChannel('schedule_channel') ?? undefined;
    const timezone          = interaction.options.getString('timezone') ?? undefined;

    if (timezone && !isValidTimezone(timezone)) {
      throw new AppError(`"${timezone}" is not a valid IANA timezone.`);
    }

    const [existing] = db.select().from(botConfig).all();

    // Allow setup when:
    // - No config exists yet (first-time setup), OR
    // - The command is coming from a different guild (moving to a new server — old founder role is irrelevant)
    // Otherwise require the Founder role.
    const isNewServer = !existing || interaction.guildId !== existing.guildId;
    if (!isNewServer && !isFounder(interaction.member!, config)) {
      throw new AppError('Only Founders can configure the bot.');
    }

    if (!existing) {
      if (!guildId || !founderRole || !gamesCategory || !archivedCategory || !scheduleChannel) {
        throw new AppError('First-time setup requires: guild_id, founder_role, games_category, archived_category, schedule_channel.');
      }

      db.insert(botConfig).values({
        id: 1,
        guildId,
        founderRoleId: founderRole.id,
        gamesCategoryId: gamesCategory.id,
        archivedCategoryId: archivedCategory.id,
        scheduleChannelId: scheduleChannel.id,
        defaultTimezone: timezone ?? 'UTC',
      }).run();
    } else {
      db.update(botConfig).set({
        ...(guildId          && { guildId }),
        ...(founderRole      && { founderRoleId: founderRole.id }),
        ...(gamesCategory    && { gamesCategoryId: gamesCategory.id }),
        ...(archivedCategory && { archivedCategoryId: archivedCategory.id }),
        ...(scheduleChannel  && { scheduleChannelId: scheduleChannel.id }),
        ...(timezone         && { defaultTimezone: timezone }),
      }).where(eq(botConfig.id, 1)).run();
    }

    invalidateConfig();

    await interaction.editReply({ content: '✅ Bot configuration updated.' });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
