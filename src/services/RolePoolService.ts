import { ne, inArray } from 'drizzle-orm';
import { DB } from '../db';
import { games } from '../db/schema';
import { AppConfig } from '../config';
import { AppError } from '../utils/errors';

export interface RolePoolStatus {
  roleId: string;
  roleName?: string;
  gameId?: number;
  gameTitle?: string;
  status: 'in_use' | 'available';
}

export class RolePoolService {
  constructor(private readonly db: DB) {}

  /**
   * Returns the IDs of roles currently in use by active (non-archived, non-cleared) games.
   */
  getUsedRoleIds(config: AppConfig): string[] {
    const activeGames = this.db
      .select({ discordRoleId: games.discordRoleId })
      .from(games)
      .where(ne(games.status, 'archived'))
      .all()
      .filter((g) => g.discordRoleId && g.discordRoleId !== '');

    // Filter out cleared status too — drizzle doesn't have a clean "not in" for
    // two values without using inArray on a negated set, so we filter in JS.
    const activeWithRoles = this.db
      .select({ discordRoleId: games.discordRoleId, status: games.status })
      .from(games)
      .all()
      .filter((g) => g.discordRoleId && !['archived', 'cleared', 'finished'].includes(g.status));

    return activeWithRoles.map((g) => g.discordRoleId!);
  }

  /**
   * Returns the next available pooled role ID, or throws if none are available.
   */
  assignNextRole(config: AppConfig): string {
    const used = new Set(this.getUsedRoleIds(config));
    const available = config.pooledRoleIds.filter((id) => !used.has(id));

    if (available.length === 0) {
      throw new AppError(
        'No pooled roles are available. Archive or clear an existing game to free up a role.'
      );
    }

    return available[0];
  }

  /**
   * Returns pool status for /admin rolepool display.
   */
  getPoolStatus(config: AppConfig): RolePoolStatus[] {
    const activeGames = this.db
      .select({ id: games.id, title: games.title, discordRoleId: games.discordRoleId, status: games.status })
      .from(games)
      .all()
      .filter((g) => g.discordRoleId && !['archived', 'cleared', 'finished'].includes(g.status));

    const gameByRole = new Map(activeGames.map((g) => [g.discordRoleId!, g]));

    return config.pooledRoleIds.map((roleId) => {
      const game = gameByRole.get(roleId);
      if (game) {
        return {
          roleId,
          gameId: game.id,
          gameTitle: game.title,
          status: 'in_use' as const,
        };
      }
      return { roleId, status: 'available' as const };
    });
  }
}
