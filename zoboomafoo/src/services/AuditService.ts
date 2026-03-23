import { DB } from '../db';
import { auditLogs } from '../db/schema';

export type AuditAction =
  | 'game.created'
  | 'game.updated'
  | 'game.paused'
  | 'game.resumed'
  | 'game.archived'
  | 'game.finished'
  | 'player.added'
  | 'player.removed'
  | 'session.created'
  | 'session.updated'
  | 'session.rescheduled'
  | 'session.canceled'
  | 'session.completed'
  | 'rsvp.set'
  | 'character.added'
  | 'character.updated'
  | 'character.removed'
  | 'repair.rebuild_schedule'
  | 'repair.relink_channel';

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
