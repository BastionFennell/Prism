import { Client, Guild } from 'discord.js';
import { eq, like, asc, and } from 'drizzle-orm';
import { DB } from '../db';
import { games, gameMemberships, sessions, auditLogs, schedulePosts, Game, GameStatus } from '../db/schema';
import { AppConfig } from '../config';
import { AppError } from '../utils/errors';
import { AuditService } from './AuditService';
import { RolePoolService } from './RolePoolService';
import { ThreadService } from './ThreadService';

export interface CreateGameInput {
  title: string;
  description?: string;
  systemName?: string;
  gmUserId: string;
  playerCap?: number;
  status?: 'recruiting' | 'active';
}

export class GameService {
  private readonly auditService: AuditService;
  private readonly rolePoolService: RolePoolService;
  private readonly threadService: ThreadService;

  constructor(
    private readonly db: DB,
    private readonly client: Client
  ) {
    this.auditService = new AuditService(db);
    this.rolePoolService = new RolePoolService(db);
    this.threadService = new ThreadService(db, client);
  }

  async createGame(
    input: CreateGameInput,
    actorUserId: string,
    config: AppConfig
  ): Promise<Game> {
    // Check for duplicate title
    const existing = this.db
      .select()
      .from(games)
      .where(eq(games.title, input.title))
      .all();
    if (existing.length > 0) {
      throw new AppError(`A game named "${input.title}" already exists.`);
    }

    // Assign pooled role
    const roleId = this.rolePoolService.assignNextRole(config);

    const now = new Date();
    const [game] = this.db
      .insert(games)
      .values({
        title: input.title,
        description: input.description ?? null,
        systemName: input.systemName ?? null,
        gmUserId: input.gmUserId,
        status: input.status ?? 'recruiting',
        playerCap: input.playerCap ?? null,
        discordRoleId: roleId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();

    // Assign role to GM in Discord
    await this.assignRoleToUser(input.gmUserId, roleId, config);

    // Create thread
    try {
      await this.threadService.createGameThread(game.id, game.title, config);
    } catch (err) {
      // Mark as errored rather than leaving half-created
      this.db.update(games).set({ status: 'paused', updatedAt: new Date() }).where(eq(games.id, game.id)).run();
      throw new AppError(
        `Game created but thread creation failed: ${err instanceof Error ? err.message : String(err)}. Game is paused; fix manually with /admin relink-thread.`
      );
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
      .where(like(games.title, `%${search}%`))
      .orderBy(asc(games.title))
      .all();
  }

  listGames(includeArchived = false): Game[] {
    const all = this.db.select().from(games).orderBy(asc(games.title)).all();
    if (includeArchived) return all;
    return all.filter((g) => !['archived', 'cleared', 'finished'].includes(g.status));
  }

  getMemberCount(gameId: number, excludeUserId?: string): number {
    return this.db
      .select()
      .from(gameMemberships)
      .where(eq(gameMemberships.gameId, gameId))
      .all()
      .filter((m) => m.active && m.userId !== excludeUserId).length;
  }

  async setStatus(
    gameId: number,
    newStatus: GameStatus,
    actorUserId: string,
    config: AppConfig
  ): Promise<Game> {
    const game = this.getGame(gameId);

    const validTransitions: Record<GameStatus, GameStatus[]> = {
      recruiting: ['active', 'paused', 'archived', 'cleared', 'finished'],
      active: ['recruiting', 'paused', 'archived', 'cleared', 'finished'],
      paused: ['active', 'archived', 'cleared', 'finished'],
      archived: ['cleared', 'finished'],
      cleared: [],
      finished: [],
    };

    if (!validTransitions[game.status as GameStatus]?.includes(newStatus)) {
      throw new AppError(
        `Cannot transition game from "${game.status}" to "${newStatus}".`
      );
    }

    const now = new Date();
    const updates: Partial<typeof games.$inferInsert> = {
      status: newStatus,
      updatedAt: now,
    };

    if (newStatus === 'archived') updates.archivedAt = now;
    if (newStatus === 'cleared') updates.clearedAt = now;
    if (newStatus === 'finished') updates.finishedAt = now;

    this.db.update(games).set(updates).where(eq(games.id, gameId)).run();

    // On archive/clear/finish: cancel scheduled sessions, remove role, archive thread
    if (newStatus === 'archived' || newStatus === 'cleared' || newStatus === 'finished') {
      this.db
        .update(sessions)
        .set({ status: 'canceled', updatedAt: now })
        .where(and(eq(sessions.gameId, gameId), eq(sessions.status, 'scheduled')))
        .run();

      await this.releaseGameRole(game, config);
      if (game.discordThreadId) {
        await this.threadService.archiveThread(game.discordThreadId);
      }
    }

    const actionMap: Record<string, 'game.paused' | 'game.resumed' | 'game.archived' | 'game.cleared' | 'game.finished' | 'game.recruiting_opened' | 'game.recruiting_closed'> = {
      paused: 'game.paused',
      active: game.status === 'recruiting' ? 'game.recruiting_closed' : 'game.resumed',
      recruiting: 'game.recruiting_opened',
      archived: 'game.archived',
      cleared: 'game.cleared',
      finished: 'game.finished',
    };
    if (actionMap[newStatus]) {
      this.auditService.log(actorUserId, actionMap[newStatus], 'game', gameId);
    }

    const [updated] = this.db.select().from(games).where(eq(games.id, gameId)).all();
    return updated;
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
        // Member may have left the server — skip
      }
    }

    // Mark all memberships as inactive
    this.db
      .update(gameMemberships)
      .set({ active: false, leftAt: new Date() })
      .where(eq(gameMemberships.gameId, game.id))
      .run();
  }

  async resyncGameRoles(gameId: number, actorUserId: string, config: AppConfig): Promise<{ added: number; removed: number }> {
    const game = this.getGame(gameId);
    if (!game.discordRoleId) throw new AppError('This game has no assigned role.');

    const guild = await this.getGuild(config);
    const dbMembers = this.db
      .select()
      .from(gameMemberships)
      .where(eq(gameMemberships.gameId, gameId))
      .all()
      .filter((m) => m.active)
      .map((m) => m.userId);

    const dbMemberSet = new Set(dbMembers);

    // Fetch all Discord guild members with this role
    await guild.members.fetch();
    const roleMembers = guild.roles.cache
      .get(game.discordRoleId)
      ?.members.map((m) => m.id) ?? [];
    const roleMemberSet = new Set(roleMembers);

    let added = 0;
    let removed = 0;

    // Add role to DB members who don't have it
    for (const userId of dbMemberSet) {
      if (!roleMemberSet.has(userId)) {
        try {
          const member = await guild.members.fetch(userId);
          await member.roles.add(game.discordRoleId);
          added++;
        } catch { /* member left server */ }
      }
    }

    // Remove role from Discord members not in DB
    for (const userId of roleMemberSet) {
      if (!dbMemberSet.has(userId)) {
        try {
          const member = await guild.members.fetch(userId);
          await member.roles.remove(game.discordRoleId!);
          removed++;
        } catch { /* member left server */ }
      }
    }

    this.auditService.log(actorUserId, 'repair.resync', 'game', gameId, { added, removed });

    return { added, removed };
  }

  async deleteGame(gameId: number, actorUserId: string, config: AppConfig): Promise<string> {
    const game = this.getGame(gameId);

    // Release role from all members first
    await this.releaseGameRole(game, config);

    // Archive the thread
    if (game.discordThreadId) {
      await this.threadService.archiveThread(game.discordThreadId);
    }

    // Delete all related records
    this.db.delete(sessions).where(eq(sessions.gameId, gameId)).run();
    this.db.delete(gameMemberships).where(eq(gameMemberships.gameId, gameId)).run();
    this.db.delete(auditLogs).where(eq(auditLogs.entityId, String(gameId))).run();
    this.db.delete(games).where(eq(games.id, gameId)).run();

    return game.title;
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
}
