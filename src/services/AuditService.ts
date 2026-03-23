import { DB } from '../db';
import { auditLogs } from '../db/schema';

export type AuditAction =
  | 'game.created'
  | 'game.updated'
  | 'game.paused'
  | 'game.resumed'
  | 'game.archived'
  | 'game.cleared'
  | 'game.finished'
  | 'game.recruiting_opened'
  | 'game.recruiting_closed'
  | 'membership.joined'
  | 'membership.left'
  | 'role.assigned'
  | 'role.released'
  | 'session.created'
  | 'session.updated'
  | 'session.rescheduled'
  | 'session.canceled'
  | 'session.completed'
  | 'repair.resync'
  | 'repair.rebuild_schedule'
  | 'repair.relink_thread'
  | 'rsvp.set'
  | 'character.added'
  | 'character.updated'
  | 'character.removed';

export class AuditService {
  constructor(private readonly db: DB) {}

  log(
    actorUserId: string,
    actionType: AuditAction,
    entityType: string,
    entityId?: string | number,
    metadata?: Record<string, unknown>
  ): void {
    this.db.insert(auditLogs).values({
      actorUserId,
      actionType,
      entityType,
      entityId: entityId != null ? String(entityId) : null,
      metadata: metadata ? JSON.stringify(metadata) : null,
      createdAt: new Date(),
    }).run();
  }
}
