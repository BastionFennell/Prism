import {
  Client,
  Guild,
  ChannelType,
  PermissionFlagsBits,
  TextChannel,
} from 'discord.js';
import { eq } from 'drizzle-orm';
import { DB } from '../db';
import { games } from '../db/schema';
import { AppConfig } from '../config';
import { AppError } from '../utils/errors';

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 100);
}

export class ChannelService {
  constructor(
    private readonly db: DB,
    private readonly client: Client
  ) {}

  async createGameChannel(
    gameId: number,
    gameTitle: string,
    gmUserId: string,
    config: AppConfig
  ): Promise<{ channelId: string; roleId: string }> {
    const guild = await this.getGuild(config);

    // 1. Create the role
    const role = await guild.roles.create({
      name: gameTitle,
      reason: `Game role for: ${gameTitle}`,
    });

    // 2. Create the channel
    const channel = await guild.channels.create({
      name: slugify(gameTitle),
      type: ChannelType.GuildText,
      parent: config.gamesCategoryId,
      permissionOverwrites: [
        {
          id: guild.roles.everyone.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: guild.members.me!.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
            PermissionFlagsBits.ManageMessages,
            PermissionFlagsBits.AddReactions,
          ],
        },
        {
          id: config.founderRoleId,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
        {
          id: role.id,
          allow: [
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages,
            PermissionFlagsBits.ReadMessageHistory,
          ],
        },
      ],
      reason: `Game channel for: ${gameTitle}`,
    });

    // 3. Assign the role to the GM
    try {
      const member = await guild.members.fetch(gmUserId);
      await member.roles.add(role.id);
    } catch {
      console.warn(`[ChannelService] Could not assign role to GM ${gmUserId}`);
    }

    // 4. Save to DB
    this.db
      .update(games)
      .set({ discordChannelId: channel.id, discordRoleId: role.id, updatedAt: new Date() })
      .where(eq(games.id, gameId))
      .run();

    return { channelId: channel.id, roleId: role.id };
  }

  async archiveGameChannel(channelId: string, config: AppConfig): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        console.warn(`[ChannelService] Channel ${channelId} not found or not a text channel.`);
        return;
      }

      // Move to archived category and sync permissions (locks it)
      await channel.setParent(config.archivedCategoryId, { lockPermissions: true });
    } catch (err) {
      console.warn(`[ChannelService] Could not archive channel ${channelId}:`, err);
    }
  }

  async relinkChannel(gameId: number, channelId: string): Promise<void> {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel || !(channel instanceof TextChannel)) {
        throw new AppError(`Channel ${channelId} is not a text channel or does not exist.`);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Could not access channel ${channelId}. Check the ID and bot permissions.`);
    }

    this.db
      .update(games)
      .set({ discordChannelId: channelId, updatedAt: new Date() })
      .where(eq(games.id, gameId))
      .run();
  }

  private async getGuild(config: AppConfig): Promise<Guild> {
    const guild = await this.client.guilds.fetch(config.guildId);
    if (!guild) throw new AppError('Could not fetch guild.');
    return guild;
  }
}
