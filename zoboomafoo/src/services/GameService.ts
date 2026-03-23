import { Client, Guild, TextChannel } from 'discord.js';
import { eq, like, asc, and, notInArray } from 'drizzle-orm';
import { DB } from '../db';
import { games, gameMemberships, sessions, auditLogs, Game, GameStatus } from '../db/schema';
import { AppConfig } from '../config';
import { AppError } from '../utils/errors';
import { AuditService } from './AuditService';
import { ChannelService } from './ChannelService';

export interface CreateGameInput {
  title: string;
  description?: string;
  systemName?: string;
  gmUserId: string;
  channelId?: string; // skip auto-create and link this existing channel
  roleId?: string;    // skip auto-create and link this existing role
}

export class GameService {
  private readonly auditService: AuditService;
  private readonly channelService: ChannelService;

  constructor(
    private readonly db: DB,
    private readonly client: Client
  ) {
    this.auditService = new AuditService(db);
    this.channelService = new ChannelService(db, client);
  }

  async createGame(
    input: CreateGameInput,
    actorUserId: string,
    config: AppConfig
  ): Promise<Game> {
    const existing = this.db
      .select()
      .from(games)
      .where(eq(games.title, input.title))
      .all();
    if (existing.length > 0) {
      throw new AppError(`A game named "${input.title}" already exists.`);
    }

    const now = new Date();
    const [game] = this.db
      .insert(games)
      .values({
        title: input.title,
        description: input.description ?? null,
        systemName: input.systemName ?? null,
        gmUserId: input.gmUserId,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();

    // Create or link channel + role
    if (input.channelId || input.roleId) {
      if (!input.channelId || !input.roleId) {
        this.db.delete(games).where(eq(games.id, game.id)).run();
        throw new AppError('You must provide both channel and role together, or neither.');
      }
      this.db
        .update(games)
        .set({ discordChannelId: input.channelId, discordRoleId: input.roleId, updatedAt: new Date() })
        .where(eq(games.id, game.id))
        .run();
      // Assign role to GM
      await this.assignRoleToUser(input.gmUserId, input.roleId, config);
    } else {
      try {
        await this.channelService.createGameChannel(game.id, game.title, input.gmUserId, config);
      } catch (err) {
        this.db.delete(games).where(eq(games.id, game.id)).run();
        throw new AppError(
          `Failed to create game channel: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    // Add GM as first member
    this.db.insert(gameMemberships).values({
      gameId: game.id,
      userId: input.gmUserId,
      active: true,
      joinedAt: now,
    }).run();

    this.auditService.log(actorUserId, 'game.created', 'game', game.id, { title: game.title });

    const [fresh] = this.db.select().from(games).where(eq(games.id, game.id)).all();
    return fresh;
  }

  getGame(gameId: number): Game {
    const [game] = this.db.select().from(games).where(eq(games.id, gameId)).all();
    if (!game) throw new AppError(`Game #${gameId} not found.`);
    return game;
  }

  findGamesByTitle(search: string): Game[] {
    return this.db
      .select()
      .from(games)
      .where(and(like(games.title, `%${search}%`), notInArray(games.status, ['finished', 'archived'])))
      .orderBy(asc(games.title))
      .all();
  }

  findGameByChannelId(channelId: string): Game | null {
    return this.db
      .select()
      .from(games)
      .where(eq(games.discordChannelId, channelId))
      .all()[0] ?? null;
  }

  listGames(includeArchived = false): Game[] {
    const all = this.db.select().from(games).orderBy(asc(games.title)).all();
    if (includeArchived) return all;
    return all.filter((g) => !['archived', 'finished'].includes(g.status));
  }

  async addPlayer(
    gameId: number,
    userId: string,
    actorUserId: string,
    config: AppConfig
  ): Promise<void> {
    const game = this.getGame(gameId);

    if (['archived', 'finished'].includes(game.status)) {
      throw new AppError('Cannot add players to an archived or finished game.');
    }

    const existing = this.db
      .select()
      .from(gameMemberships)
      .where(and(eq(gameMemberships.gameId, gameId), eq(gameMemberships.userId, userId)))
      .all()[0];

    if (existing?.active) {
      throw new AppError('This player is already in the game.');
    }

    if (existing) {
      // Re-activate
      this.db
        .update(gameMemberships)
        .set({ active: true, leftAt: null, joinedAt: new Date() })
        .where(eq(gameMemberships.id, existing.id))
        .run();
    } else {
      this.db.insert(gameMemberships).values({
        gameId,
        userId,
        active: true,
        joinedAt: new Date(),
      }).run();
    }

    // Assign Discord role
    if (game.discordRoleId) {
      await this.assignRoleToUser(userId, game.discordRoleId, config);
    }

    this.auditService.log(actorUserId, 'player.added', 'game', gameId, { userId });
  }

  async removePlayer(
    gameId: number,
    userId: string,
    actorUserId: string,
    config: AppConfig
  ): Promise<void> {
    const game = this.getGame(gameId);

    const membership = this.db
      .select()
      .from(gameMemberships)
      .where(and(eq(gameMemberships.gameId, gameId), eq(gameMemberships.userId, userId)))
      .all()
      .find((m) => m.active);

    if (!membership) {
      throw new AppError('This player is not in the game.');
    }

    this.db
      .update(gameMemberships)
      .set({ active: false, leftAt: new Date() })
      .where(eq(gameMemberships.id, membership.id))
      .run();

    // Remove Discord role
    if (game.discordRoleId) {
      await this.removeRoleFromUser(userId, game.discordRoleId, config);
    }

    this.auditService.log(actorUserId, 'player.removed', 'game', gameId, { userId });
  }

  async setStatus(
    gameId: number,
    newStatus: GameStatus,
    actorUserId: string,
    config: AppConfig
  ): Promise<Game> {
    const game = this.getGame(gameId);

    const validTransitions: Record<GameStatus, GameStatus[]> = {
      active:   ['paused', 'archived', 'finished'],
      paused:   ['active', 'archived', 'finished'],
      archived: ['finished'],
      finished: [],
    };

    if (!validTransitions[game.status as GameStatus]?.includes(newStatus)) {
      throw new AppError(`Cannot transition game from "${game.status}" to "${newStatus}".`);
    }

    const now = new Date();
    const updates: Partial<typeof games.$inferInsert> = { status: newStatus, updatedAt: now };
    if (newStatus === 'archived') updates.archivedAt = now;
    if (newStatus === 'finished') updates.finishedAt = now;

    this.db.update(games).set(updates).where(eq(games.id, gameId)).run();

    if (newStatus === 'archived' || newStatus === 'finished') {
      // Cancel all scheduled sessions
      this.db
        .update(sessions)
        .set({ status: 'canceled', updatedAt: now })
        .where(and(eq(sessions.gameId, gameId), eq(sessions.status, 'scheduled')))
        .run();

      // Move channel to archived category
      if (game.discordChannelId) {
        await this.channelService.archiveGameChannel(game.discordChannelId, config);
      }
    }

    const actionMap: Record<GameStatus, 'game.paused' | 'game.resumed' | 'game.archived' | 'game.finished'> = {
      paused:   'game.paused',
      active:   'game.resumed',
      archived: 'game.archived',
      finished: 'game.finished',
    };
    this.auditService.log(actorUserId, actionMap[newStatus], 'game', gameId);

    const [updated] = this.db.select().from(games).where(eq(games.id, gameId)).all();
    return updated;
  }

  async setRole(gameId: number, roleId: string, actorUserId: string): Promise<void> {
    this.getGame(gameId); // validates existence
    this.db
      .update(games)
      .set({ discordRoleId: roleId, updatedAt: new Date() })
      .where(eq(games.id, gameId))
      .run();
    this.auditService.log(actorUserId, 'game.updated', 'game', gameId, { roleId });
  }

  async relinkGame(
    gameId: number,
    channelId: string | undefined,
    roleId: string | undefined,
    actorUserId: string,
    config: AppConfig
  ): Promise<void> {
    if (!channelId && !roleId) throw new AppError('Provide at least a channel or a role to relink.');
    this.getGame(gameId);

    const updates: Record<string, unknown> = { updatedAt: new Date() };

    if (channelId) {
      try {
        const ch = await this.client.channels.fetch(channelId);
        if (!ch || !(ch instanceof TextChannel)) throw new Error();
      } catch {
        throw new AppError(`Could not access <#${channelId}>. Make sure it's a text channel the bot can see.`);
      }
      updates.discordChannelId = channelId;
    }

    if (roleId) {
      try {
        const guild = await this.getGuild(config);
        const role = await guild.roles.fetch(roleId);
        if (!role) throw new Error();
      } catch {
        throw new AppError(`Could not access <@&${roleId}>. Check the role ID.`);
      }
      updates.discordRoleId = roleId;
    }

    this.db.update(games).set(updates).where(eq(games.id, gameId)).run();
    this.auditService.log(actorUserId, 'game.updated', 'game', gameId, { channelId, roleId });
  }

  async deleteGame(gameId: number, actorUserId: string, config: AppConfig): Promise<string> {
    const game = this.getGame(gameId);

    await this.releaseGameRole(game, config);

    if (game.discordChannelId) {
      await this.channelService.archiveGameChannel(game.discordChannelId, config);
    }

    this.db.delete(sessions).where(eq(sessions.gameId, gameId)).run();
    this.db.delete(gameMemberships).where(eq(gameMemberships.gameId, gameId)).run();
    this.db.delete(auditLogs).where(eq(auditLogs.entityId, String(gameId))).run();
    this.db.delete(games).where(eq(games.id, gameId)).run();

    return game.title;
  }

  private async releaseGameRole(game: Game, config: AppConfig): Promise<void> {
    if (!game.discordRoleId) return;

    const members = this.db
      .select()
      .from(gameMemberships)
      .where(eq(gameMemberships.gameId, game.id))
      .all()
      .filter((m) => m.active);

    const guild = await this.getGuild(config);
    for (const member of members) {
      try {
        const guildMember = await guild.members.fetch(member.userId);
        await guildMember.roles.remove(game.discordRoleId);
      } catch {
        // Member may have left the server
      }
    }

    this.db
      .update(gameMemberships)
      .set({ active: false, leftAt: new Date() })
      .where(eq(gameMemberships.gameId, game.id))
      .run();
  }

  private async getGuild(config: AppConfig): Promise<Guild> {
    const guild = await this.client.guilds.fetch(config.guildId);
    if (!guild) throw new AppError('Could not fetch guild.');
    return guild;
  }

  private async assignRoleToUser(userId: string, roleId: string, config: AppConfig): Promise<void> {
    try {
      const guild = await this.getGuild(config);
      const member = await guild.members.fetch(userId);
      await member.roles.add(roleId);
    } catch (err) {
      console.warn(`[GameService] Could not assign role ${roleId} to user ${userId}:`, err);
    }
  }

  private async removeRoleFromUser(userId: string, roleId: string, config: AppConfig): Promise<void> {
    try {
      const guild = await this.getGuild(config);
      const member = await guild.members.fetch(userId);
      await member.roles.remove(roleId);
    } catch (err) {
      console.warn(`[GameService] Could not remove role ${roleId} from user ${userId}:`, err);
    }
  }
}
