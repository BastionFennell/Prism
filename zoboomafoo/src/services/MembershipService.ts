import { eq } from 'drizzle-orm';
import { DB } from '../db';
import { gameMemberships, GameMembership } from '../db/schema';

export class MembershipService {
  constructor(private readonly db: DB) {}

  getMembers(gameId: number): GameMembership[] {
    return this.db
      .select()
      .from(gameMemberships)
      .where(eq(gameMemberships.gameId, gameId))
      .all()
      .filter((m) => m.active);
  }

  getMemberCount(gameId: number): number {
    return this.getMembers(gameId).length;
  }

  isMember(gameId: number, userId: string): boolean {
    return this.db
      .select()
      .from(gameMemberships)
      .where(eq(gameMemberships.gameId, gameId))
      .all()
      .some((m) => m.active && m.userId === userId);
  }
}
