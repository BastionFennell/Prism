import { eq, and } from 'drizzle-orm';
import { DB } from '../db';
import { rsvps, sessions, games, gameMemberships, Rsvp, RsvpResponse } from '../db/schema';
import { AppError } from '../utils/errors';
import { AuditService } from './AuditService';

export interface RsvpCounts {
  yes: number;
  no: number;
  maybe: number;
}

export class RsvpService {
  private readonly auditService: AuditService;

  constructor(private readonly db: DB) {
    this.auditService = new AuditService(db);
  }

  setRsvp(sessionId: number, userId: string, response: RsvpResponse): Rsvp {
    const [session] = this.db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    if (!session) throw new AppError(`Session #${sessionId} not found.`);
    if (session.status !== 'scheduled') throw new AppError('Cannot RSVP to a session that is not scheduled.');

    // Validate the user is an active member of the game
    const isMember = this.db
      .select()
      .from(gameMemberships)
      .where(and(eq(gameMemberships.gameId, session.gameId), eq(gameMemberships.userId, userId)))
      .all()
      .some((m) => m.active);

    if (!isMember) throw new AppError('You must be a member of this game to RSVP.');

    const now = new Date();
    const existing = this.db
      .select()
      .from(rsvps)
      .where(and(eq(rsvps.sessionId, sessionId), eq(rsvps.userId, userId)))
      .all()[0];

    if (existing) {
      this.db
        .update(rsvps)
        .set({ response, updatedAt: now })
        .where(eq(rsvps.id, existing.id))
        .run();
      return { ...existing, response, updatedAt: now };
    }

    const result = this.db
      .insert(rsvps)
      .values({ sessionId, userId, response, updatedAt: now })
      .returning()
      .get();

    this.auditService.log(userId, 'rsvp.set', 'session', sessionId, { response });
    return result;
  }

  getRsvps(sessionId: number): Rsvp[] {
    return this.db.select().from(rsvps).where(eq(rsvps.sessionId, sessionId)).all();
  }

  getRsvpCounts(sessionId: number): RsvpCounts {
    const all = this.getRsvps(sessionId);
    return {
      yes:   all.filter((r) => r.response === 'yes').length,
      no:    all.filter((r) => r.response === 'no').length,
      maybe: all.filter((r) => r.response === 'maybe').length,
    };
  }

  getUserRsvp(sessionId: number, userId: string): Rsvp | null {
    return this.db
      .select()
      .from(rsvps)
      .where(and(eq(rsvps.sessionId, sessionId), eq(rsvps.userId, userId)))
      .all()[0] ?? null;
  }
}
