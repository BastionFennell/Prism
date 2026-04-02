import { Client } from 'discord.js';
import { eq, and } from 'drizzle-orm';
import { DB } from '../db';
import { gameMemberships, games } from '../db/schema';
import { AppConfig } from '../config';
import { AppError } from '../utils/errors';
import { AuditService } from './AuditService';

export class MembershipService {
  private readonly auditService: AuditService;

  constructor(
    private readonly db: DB,
    private readonly client: Client
  ) {
    this.auditService = new AuditService(db);
  }

  async joinGame(
    gameId: number,
    userId: string,
    actorUserId: string,
    config: AppConfig
  ): Promise<void> {
    const [game] = this.db.select().from(games).where(eq(games.id, gameId)).all();
    if (!game) throw new AppError(`Game #${gameId} not found.`);

    if (['archived', 'cleared'].includes(game.status)) {
      throw new AppError('This game is no longer active.');
    }

    // Check for existing active membership
    const existing = this.db
      .select()
      .from(gameMemberships)
      .where(and(eq(gameMemberships.gameId, gameId), eq(gameMemberships.userId, userId)))
      .all()
      .find((m) => m.active);

    if (existing) throw new AppError('You are already a member of this game.');

    // Enforce player cap (GM does not count toward the limit)
    if (game.playerCap != null) {
      const count = this.db
        .select()
        .from(gameMemberships)
        .where(eq(gameMemberships.gameId, gameId))
        .all()
        .filter((m) => m.active && m.userId !== game.gmUserId).length;

      if (count >= game.playerCap) {
        throw new AppError(`This game is full (${game.playerCap} players max).`);
      }
    }

    // Re-activate old record or insert new
    const inactive = this.db
      .select()
      .from(gameMemberships)
      .where(and(eq(gameMemberships.gameId, gameId), eq(gameMemberships.userId, userId)))
      .all()
      .find((m) => !m.active);

    if (inactive) {
      this.db
        .update(gameMemberships)
        .set({ active: true, joinedAt: new Date(), leftAt: null })
        .where(eq(gameMemberships.id, inactive.id))
        .run();
    } else {
      this.db
        .insert(gameMemberships)
        .values({ gameId, userId, active: true, joinedAt: new Date() })
        .run();
    }

    // Sync Discord role
    if (game.discordRoleId) {
      await this.addRole(userId, game.discordRoleId, config);
    }

    this.auditService.log(actorUserId, 'membership.joined', 'game', gameId, { userId });
  }

  async leaveGame(
    gameId: number,
    userId: string,
    actorUserId: string,
    config: AppConfig
  ): Promise<void> {
    const [game] = this.db.select().from(games).where(eq(games.id, gameId)).all();
    if (!game) throw new AppError(`Game #${gameId} not found.`);

    const membership = this.db
      .select()
      .from(gameMemberships)
      .where(and(eq(gameMemberships.gameId, gameId), eq(gameMemberships.userId, userId)))
      .all()
      .find((m) => m.active);

    if (!membership) throw new AppError('You are not a member of this game.');

    this.db
      .update(gameMemberships)
      .set({ active: false, leftAt: new Date() })
      .where(eq(gameMemberships.id, membership.id))
      .run();

    // Sync Discord role
    if (game.discordRoleId) {
      await this.removeRole(userId, game.discordRoleId, config);
    }

    this.auditService.log(actorUserId, 'membership.left', 'game', gameId, { userId });
  }

  getActiveMembers(gameId: number): string[] {
    return this.db
      .select()
      .from(gameMemberships)
      .where(eq(gameMemberships.gameId, gameId))
      .all()
      .filter((m) => m.active)
      .map((m) => m.userId);
  }

  private async addRole(userId: string, roleId: string, config: AppConfig): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(config.guildId);
      const member = await guild.members.fetch(userId);
      await member.roles.add(roleId);
    } catch (err) {
      console.warn(`[MembershipService] Could not add role ${roleId} to ${userId}:`, err);
    }
  }

  private async removeRole(userId: string, roleId: string, config: AppConfig): Promise<void> {
    try {
      const guild = await this.client.guilds.fetch(config.guildId);
      const member = await guild.members.fetch(userId);
      await member.roles.remove(roleId);
    } catch (err) {
      console.warn(`[MembershipService] Could not remove role ${roleId} from ${userId}:`, err);
    }
  }
}
