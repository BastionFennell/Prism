import { Client, TextChannel, ChannelType, ThreadAutoArchiveDuration } from 'discord.js';
import { DB } from '../db';
import { games } from '../db/schema';
import { eq } from 'drizzle-orm';
import { AppConfig } from '../config';
import { AppError } from '../utils/errors';

export class ThreadService {
  constructor(
    private readonly db: DB,
    private readonly client: Client
  ) {}

  async createGameThread(
    gameId: number,
    gameTitle: string,
    config: AppConfig
  ): Promise<string> {
    const channel = await this.client.channels.fetch(config.gamesChannelId);

    if (!channel || !('threads' in channel)) {
      throw new AppError('Games channel not found or is not a text channel.');
    }

    const textChannel = channel as TextChannel;
    const thread = await textChannel.threads.create({
      name: gameTitle,
      autoArchiveDuration: ThreadAutoArchiveDuration.OneWeek,
      type: ChannelType.PublicThread,
      reason: `Community game: ${gameTitle}`,
    });

    // Save thread ID to game record
    this.db
      .update(games)
      .set({ discordThreadId: thread.id, updatedAt: new Date() })
      .where(eq(games.id, gameId))
      .run();

    return thread.id;
  }

  async archiveThread(threadId: string): Promise<void> {
    try {
      const thread = await this.client.channels.fetch(threadId);
      if (thread && thread.isThread()) {
        if (!thread.name.startsWith('(Finished)')) {
          await thread.setName(`(Finished) ${thread.name}`);
        }
        await thread.setArchived(true, 'Game archived or cleared');
      }
    } catch (err) {
      // Thread may already be deleted or inaccessible — log but don't throw
      console.warn(`[ThreadService] Could not archive thread ${threadId}:`, err);
    }
  }

  async relinkThread(gameId: number, threadId: string): Promise<void> {
    // Verify the thread exists and is accessible
    try {
      const thread = await this.client.channels.fetch(threadId);
      if (!thread || !thread.isThread()) {
        throw new AppError(`Channel ${threadId} is not a thread or does not exist.`);
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError(`Could not access thread ${threadId}. Check the ID and bot permissions.`);
    }

    this.db
      .update(games)
      .set({ discordThreadId: threadId, updatedAt: new Date() })
      .where(eq(games.id, gameId))
      .run();
  }
}
