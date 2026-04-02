import { Client, ThreadChannel } from 'discord.js';
import { eq, and, isNull, gt } from 'drizzle-orm';
import { DB } from '../db';
import { sessions, games } from '../db/schema';
import { loadConfig } from '../config';
import { discordTimestamp } from '../utils/time';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const H24 = 24 * 60 * 60 * 1000;
const H2  =  2 * 60 * 60 * 1000;

export class ReminderService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DB,
    private readonly client: Client
  ) {}

  start(): void {
    if (this.intervalId) return;
    // Run immediately, then on interval
    this.checkAndSendReminders().catch(console.error);
    this.intervalId = setInterval(() => {
      this.checkAndSendReminders().catch(console.error);
    }, POLL_INTERVAL_MS);
    console.log('[ReminderService] Started polling every 5 minutes.');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkAndSendReminders(): Promise<void> {
    const config = await loadConfig();
    if (!config.guildId) return;

    const now = new Date();

    // Fetch all upcoming scheduled sessions that might need a reminder
    const upcoming = this.db
      .select({ session: sessions, game: games })
      .from(sessions)
      .innerJoin(games, eq(sessions.gameId, games.id))
      .where(and(eq(sessions.status, 'scheduled'), gt(sessions.startAt, now)))
      .all();

    for (const { session, game } of upcoming) {
      const msUntil = session.startAt.getTime() - now.getTime();

      if (msUntil <= H24 && !session.reminder24hSentAt) {
        await this.sendReminder(session.id, game, '24 hours');
      } else if (msUntil <= H2 && !session.reminder2hSentAt) {
        await this.sendReminder(session.id, game, '2 hours');
      }
    }
  }

  private async sendReminder(
    sessionId: number,
    game: typeof games.$inferSelect,
    timeframe: '24 hours' | '2 hours'
  ): Promise<void> {
    if (!game.discordThreadId) return;

    try {
      const channel = await this.client.channels.fetch(game.discordThreadId);
      if (!channel || !channel.isThread()) {
        console.warn(`[ReminderService] Thread ${game.discordThreadId} not found for game ${game.id}`);
        return;
      }

      const [fullSession] = this.db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
      if (!fullSession) return;

      const roleMention = game.discordRoleId ? `<@&${game.discordRoleId}>` : '';
      const content = [
        `🔔 **${game.title}** session in **${timeframe}**!`,
        `📅 ${discordTimestamp(fullSession.startAt, 'F')} (${discordTimestamp(fullSession.startAt, 'R')})`,
        roleMention,
      ].filter(Boolean).join('\n');

      await (channel as ThreadChannel).send(content);

      // Mark reminder as sent
      const now = new Date();
      if (timeframe === '24 hours') {
        this.db.update(sessions).set({ reminder24hSentAt: now }).where(eq(sessions.id, sessionId)).run();
      } else {
        this.db.update(sessions).set({ reminder2hSentAt: now }).where(eq(sessions.id, sessionId)).run();
      }

      console.log(`[ReminderService] Sent ${timeframe} reminder for session ${sessionId} (${game.title})`);
    } catch (err) {
      console.warn(`[ReminderService] Failed to send reminder for session ${sessionId}:`, err);
    }
  }
}
