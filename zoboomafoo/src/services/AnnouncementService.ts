import { Client, TextChannel, NewsChannel } from 'discord.js';
import { eq, lte, isNull, isNotNull } from 'drizzle-orm';
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

  saveConfirmMessage(id: number, confirmMessageId: string, confirmChannelId: string): void {
    this.db
      .update(announcementQueue)
      .set({ confirmMessageId, confirmChannelId })
      .where(eq(announcementQueue.id, id))
      .run();
  }

  /** Finds an unsent announcement by its confirmation message ID. */
  findByConfirmMessage(confirmMessageId: string): AnnouncementQueueEntry | null {
    const entry = this.db
      .select()
      .from(announcementQueue)
      .where(eq(announcementQueue.confirmMessageId, confirmMessageId))
      .get();

    if (!entry || entry.sentAt) return null;
    return entry;
  }

  /** Reschedules an unsent announcement by its confirmation message ID. Returns the updated entry or null if not found/already sent. */
  reschedule(confirmMessageId: string, newSendAt: Date): AnnouncementQueueEntry | null {
    const entry = this.db
      .select()
      .from(announcementQueue)
      .where(eq(announcementQueue.confirmMessageId, confirmMessageId))
      .get();

    if (!entry || entry.sentAt) return null;

    this.db
      .update(announcementQueue)
      .set({ sendAt: newSendAt })
      .where(eq(announcementQueue.id, entry.id))
      .run();

    return { ...entry, sendAt: newSendAt };
  }

  /** Cancels an unsent announcement by its confirmation message ID. Returns the entry or null if not found/already sent. */
  cancel(confirmMessageId: string): AnnouncementQueueEntry | null {
    const entry = this.db
      .select()
      .from(announcementQueue)
      .where(eq(announcementQueue.confirmMessageId, confirmMessageId))
      .get();

    if (!entry || entry.sentAt) return null;

    this.db
      .delete(announcementQueue)
      .where(eq(announcementQueue.id, entry.id))
      .run();

    return entry;
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
      if (!sourceChannel || !(sourceChannel instanceof TextChannel || sourceChannel instanceof NewsChannel)) {
        console.warn(`[AnnouncementService] Source channel ${entry.sourceChannelId} not found or not a text/announcement channel.`);
        this.markFailed(entry.id);
        return;
      }

      const message = await sourceChannel.messages.fetch(entry.messageId);

      const targetChannel = await this.client.channels.fetch(entry.targetChannelId);
      if (!targetChannel || !(targetChannel instanceof TextChannel || targetChannel instanceof NewsChannel)) {
        console.warn(`[AnnouncementService] Target channel ${entry.targetChannelId} not found or not a text/announcement channel.`);
        this.markFailed(entry.id);
        return;
      }

      const sent = await targetChannel.send({
        content: message.content || undefined,
        embeds: message.embeds.length ? message.embeds : undefined,
      });

      this.db
        .update(announcementQueue)
        .set({ sentAt: new Date() })
        .where(eq(announcementQueue.id, entry.id))
        .run();

      console.log(`[AnnouncementService] Sent announcement ${entry.id} to channel ${entry.targetChannelId}.`);

      if (entry.confirmMessageId && entry.confirmChannelId) {
        try {
          const confirmChannel = await this.client.channels.fetch(entry.confirmChannelId);
          if (confirmChannel instanceof TextChannel || confirmChannel instanceof NewsChannel) {
            const confirmMsg = await confirmChannel.messages.fetch(entry.confirmMessageId);
            await confirmMsg.edit(`📣 Announcement posted. [Jump to message](${sent.url})`);
          }
        } catch {
          // Best-effort — don't fail the send if the confirm message is gone
        }
      }
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
