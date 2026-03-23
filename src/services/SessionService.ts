import { eq, and, gt, asc } from 'drizzle-orm';
import { DB } from '../db';
import { sessions, games, Session, SessionStatus } from '../db/schema';
import { AppConfig } from '../config';
import { AppError } from '../utils/errors';
import { AuditService } from './AuditService';

export interface CreateSessionInput {
  gameId: number;
  title?: string;
  notes?: string;
  startAt: Date;
  durationMinutes?: number;
  timezone: string;
}

export interface UpdateSessionInput {
  title?: string;
  notes?: string;
  startAt?: Date;
  durationMinutes?: number;
  timezone?: string;
}

export class SessionService {
  private readonly auditService: AuditService;

  constructor(private readonly db: DB) {
    this.auditService = new AuditService(db);
  }

  createSession(
    input: CreateSessionInput,
    actorUserId: string,
    config: AppConfig
  ): Session {
    const [game] = this.db.select().from(games).where(eq(games.id, input.gameId)).all();
    if (!game) throw new AppError(`Game #${input.gameId} not found.`);

    if (['archived', 'cleared'].includes(game.status)) {
      throw new AppError('Cannot add sessions to an archived or cleared game.');
    }

    const now = new Date();
    const [session] = this.db
      .insert(sessions)
      .values({
        gameId: input.gameId,
        title: input.title ?? null,
        notes: input.notes ?? null,
        startAt: input.startAt,
        durationMinutes: input.durationMinutes ?? null,
        timezone: input.timezone,
        status: 'scheduled',
        createdByUserId: actorUserId,
        createdAt: now,
        updatedAt: now,
      })
      .returning()
      .all();

    this.auditService.log(actorUserId, 'session.created', 'session', session.id, {
      gameId: input.gameId,
      startAt: input.startAt.toISOString(),
    });

    return session;
  }

  getSession(sessionId: number): Session {
    const [session] = this.db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    if (!session) throw new AppError(`Session #${sessionId} not found.`);
    return session;
  }

  updateSession(
    sessionId: number,
    input: UpdateSessionInput,
    actorUserId: string
  ): Session {
    const session = this.getSession(sessionId);

    if (session.status !== 'scheduled') {
      throw new AppError(`Cannot edit a session with status "${session.status}".`);
    }

    this.db
      .update(sessions)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.notes !== undefined && { notes: input.notes }),
        ...(input.startAt !== undefined && { startAt: input.startAt }),
        ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        updatedAt: new Date(),
      })
      .where(eq(sessions.id, sessionId))
      .run();

    const isReschedule = input.startAt !== undefined;
    this.auditService.log(
      actorUserId,
      isReschedule ? 'session.rescheduled' : 'session.updated',
      'session',
      sessionId
    );

    return this.getSession(sessionId);
  }

  setSessionStatus(
    sessionId: number,
    newStatus: 'canceled' | 'completed',
    actorUserId: string
  ): Session {
    const session = this.getSession(sessionId);

    if (session.status !== 'scheduled') {
      throw new AppError(`Session is already "${session.status}".`);
    }

    this.db
      .update(sessions)
      .set({ status: newStatus, updatedAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .run();

    const actionMap = {
      canceled: 'session.canceled' as const,
      completed: 'session.completed' as const,
    };
    this.auditService.log(actorUserId, actionMap[newStatus], 'session', sessionId);

    return this.getSession(sessionId);
  }

  getUpcomingSessions(gameId?: number): Session[] {
    const now = new Date();
    const all = this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.status, 'scheduled'),
          gt(sessions.startAt, now)
        )
      )
      .orderBy(asc(sessions.startAt))
      .all();

    if (gameId != null) {
      return all.filter((s) => s.gameId === gameId);
    }

    return all;
  }

  getNextSession(gameId: number): Session | null {
    const upcoming = this.getUpcomingSessions(gameId);
    return upcoming[0] ?? null;
  }

  listSessionsForGame(gameId: number): Session[] {
    return this.db
      .select()
      .from(sessions)
      .where(eq(sessions.gameId, gameId))
      .orderBy(asc(sessions.startAt))
      .all();
  }
}
