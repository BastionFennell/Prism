import { Client, TextChannel } from 'discord.js';
import { eq, lte, isNull } from 'drizzle-orm';
import { DB } from '../db';
import { announcementQueue, AnnouncementQueueEntry } from '../db/schema';
import { loadConfig } from '../config';

const POLL_INTERVAL_MS = 60 * 1000; // 1 minute

export class AnnouncementService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DB,
    private readonly client: Client
  ) {}

  schedule(
    messageId: string,
    sourceChannelId: string,
    targetChannelId: string,
    sendAt: Date,
    createdByUserId: string
  ): AnnouncementQueueEntry {
    return this.db
      .insert(announcementQueue)
      .values({
        messageId,
        sourceChannelId,
        targetChannelId,
        sendAt,
        createdByUserId,
        createdAt: new Date(),
      })
      .returning()
      .get();
  }

  start(): void {
    if (this.intervalId) return;
    this.checkAndSend().catch(console.error);
    this.intervalId = setInterval(() => {
      this.checkAndSend().catch(console.error);
    }, POLL_INTERVAL_MS);
    console.log('[AnnouncementService] Started polling every 1 minute.');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkAndSend(): Promise<void> {
    const config = loadConfig();
    if (!config.guildId) return;

    const now = new Date();
    const due = this.db
      .select()
      .from(announcementQueue)
      .where(lte(announcementQueue.sendAt, now))
      .all()
      .filter((a) => !a.sentAt);

    for (const entry of due) {
      await this.send(entry);
    }
  }

  private async send(entry: AnnouncementQueueEntry): Promise<void> {
    try {
      const sourceChannel = await this.client.channels.fetch(entry.sourceChannelId);
      if (!sourceChannel || !(sourceChannel instanceof TextChannel)) {
        console.warn(`[AnnouncementService] Source channel ${entry.sourceChannelId} not found or not a text channel.`);
        this.markFailed(entry.id);
        return;
      }

      const message = await sourceChannel.messages.fetch(entry.messageId);

      const targetChannel = await this.client.channels.fetch(entry.targetChannelId);
      if (!targetChannel || !(targetChannel instanceof TextChannel)) {
        console.warn(`[AnnouncementService] Target channel ${entry.targetChannelId} not found or not a text channel.`);
        this.markFailed(entry.id);
        return;
      }

      await targetChannel.send({
        content: message.content || undefined,
        embeds: message.embeds.length ? message.embeds : undefined,
      });

      this.db
        .update(announcementQueue)
        .set({ sentAt: new Date() })
        .where(eq(announcementQueue.id, entry.id))
        .run();

      console.log(`[AnnouncementService] Sent announcement ${entry.id} to channel ${entry.targetChannelId}.`);
    } catch (err) {
      console.warn(`[AnnouncementService] Failed to send announcement ${entry.id}:`, err);
    }
  }

  // Mark sent so it doesn't retry on every poll when the source message is gone
  private markFailed(id: number): void {
    this.db
      .update(announcementQueue)
      .set({ sentAt: new Date() })
      .where(eq(announcementQueue.id, id))
      .run();
  }
}
