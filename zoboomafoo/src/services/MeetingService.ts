import { eq, and, gt, asc } from 'drizzle-orm';
import { DB } from '../db';
import { meetings, Meeting } from '../db/schema';
import { AppError } from '../utils/errors';
import { AuditService } from './AuditService';

export interface CreateMeetingInput {
  title: string;
  startAt: Date;
  durationMinutes?: number;
  timezone: string;
}

export interface UpdateMeetingInput {
  title?: string;
  startAt?: Date;
  durationMinutes?: number;
  timezone?: string;
}

export class MeetingService {
  private readonly auditService: AuditService;

  constructor(private readonly db: DB) {
    this.auditService = new AuditService(db);
  }

  createMeeting(input: CreateMeetingInput, actorUserId: string): Meeting {
    const now = new Date();
    const [meeting] = this.db
      .insert(meetings)
      .values({
        title: input.title,
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

    this.auditService.log(actorUserId, 'meeting.created', 'meeting', meeting.id, {
      startAt: input.startAt.toISOString(),
    });

    return meeting;
  }

  getMeeting(meetingId: number): Meeting {
    const [meeting] = this.db.select().from(meetings).where(eq(meetings.id, meetingId)).all();
    if (!meeting) throw new AppError(`Meeting #${meetingId} not found.`);
    return meeting;
  }

  updateMeeting(
    meetingId: number,
    input: UpdateMeetingInput,
    actorUserId: string
  ): Meeting {
    const meeting = this.getMeeting(meetingId);

    if (meeting.status !== 'scheduled') {
      throw new AppError(`Cannot edit a meeting with status "${meeting.status}".`);
    }

    this.db
      .update(meetings)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.startAt !== undefined && { startAt: input.startAt }),
        ...(input.durationMinutes !== undefined && { durationMinutes: input.durationMinutes }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
        updatedAt: new Date(),
      })
      .where(eq(meetings.id, meetingId))
      .run();

    const isReschedule = input.startAt !== undefined;
    this.auditService.log(
      actorUserId,
      isReschedule ? 'meeting.rescheduled' : 'meeting.updated',
      'meeting',
      meetingId
    );

    return this.getMeeting(meetingId);
  }

  cancelMeeting(meetingId: number, actorUserId: string): Meeting {
    const meeting = this.getMeeting(meetingId);
    if (meeting.status !== 'scheduled') {
      throw new AppError(`Meeting is already "${meeting.status}".`);
    }

    this.db
      .update(meetings)
      .set({ status: 'canceled', updatedAt: new Date() })
      .where(eq(meetings.id, meetingId))
      .run();

    this.auditService.log(actorUserId, 'meeting.canceled', 'meeting', meetingId);
    return this.getMeeting(meetingId);
  }

  completeMeeting(meetingId: number, actorUserId: string): Meeting {
    const meeting = this.getMeeting(meetingId);
    if (meeting.status !== 'scheduled') {
      throw new AppError(`Meeting is already "${meeting.status}".`);
    }

    this.db
      .update(meetings)
      .set({ status: 'completed', updatedAt: new Date() })
      .where(eq(meetings.id, meetingId))
      .run();

    this.auditService.log(actorUserId, 'meeting.completed', 'meeting', meetingId);
    return this.getMeeting(meetingId);
  }

  getUpcomingMeetings(): Meeting[] {
    return this.db
      .select()
      .from(meetings)
      .where(and(eq(meetings.status, 'scheduled'), gt(meetings.startAt, new Date())))
      .orderBy(asc(meetings.startAt))
      .all();
  }

  getNextMeeting(): Meeting | null {
    return this.getUpcomingMeetings()[0] ?? null;
  }
}
