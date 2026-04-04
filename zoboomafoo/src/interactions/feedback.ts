import { Message, MessageContextMenuCommandInteraction, MessageFlags } from 'discord.js';
import { eq } from 'drizzle-orm';
import { FeedbackService, ConversationMessage } from '../services/FeedbackService';
import { AppError } from '../utils/errors';
import { db } from '../db';
import { feedbackThreads } from '../db/schema';

export async function handleGetFeedbackContext(
  interaction: MessageContextMenuCommandInteraction
): Promise<void> {
  try {
    const message = interaction.targetMessage;

    // Find the first image attachment or embed image
    const imageUrl =
      message.attachments.find((a) => a.contentType?.startsWith('image/'))?.url ??
      message.embeds.find((e) => e.image)?.image?.url ??
      message.embeds.find((e) => e.thumbnail)?.thumbnail?.url;

    const textContent = message.content || undefined;

    if (!imageUrl && !textContent) {
      throw new AppError('This message has no image or text to give feedback on.');
    }

    await interaction.deferReply();

    const feedbackService = new FeedbackService();
    const feedback = await feedbackService.getFeedback({
      imageUrl,
      prompt: textContent,
    });

    const reply = await interaction.editReply({ content: feedback });

    // Create a thread for follow-up conversation
    const thread = await reply.startThread({
      name: `Feedback: ${textContent?.slice(0, 80) || 'Discussion'}`,
    });

    db.insert(feedbackThreads).values({
      threadId: thread.id,
      imageUrl: imageUrl ?? null,
      originalPrompt: textContent ?? null,
      createdAt: new Date(),
    }).run();

    await thread.send('Reply in this thread to continue the conversation about this feedback.');
  } catch (err) {
    const msg = err instanceof AppError
      ? err.userMessage
      : 'Something went wrong getting feedback. Please try again.';

    if (!(err instanceof AppError)) {
      console.error('[feedback] Error handling context menu feedback:', err);
    }

    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: `❌ ${msg}` });
    } else {
      await interaction.reply({ content: `❌ ${msg}`, flags: MessageFlags.Ephemeral });
    }
  }
}

export async function handleFeedbackThreadMessage(message: Message): Promise<void> {
  if (message.author.bot) return;
  if (!message.channel.isThread()) return;

  const threadRow = db
    .select()
    .from(feedbackThreads)
    .where(eq(feedbackThreads.threadId, message.channel.id))
    .get();

  if (!threadRow) return;

  // Collect thread history for conversation context
  const messages = await message.channel.messages.fetch({ limit: 50 });
  const sorted = [...messages.values()].sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  // Build conversation history starting with the original request and feedback
  const history: ConversationMessage[] = [];
  const botId = message.client.user?.id;

  // Include the original prompt as the first user message
  if (threadRow.originalPrompt) {
    history.push({ role: 'user', content: threadRow.originalPrompt });
  }

  // The parent message (starter message) contains the original feedback
  const starterMessage = await message.channel.fetchStarterMessage().catch(() => null);
  if (starterMessage?.author.id === botId && starterMessage.content) {
    history.push({ role: 'assistant', content: starterMessage.content });
  }

  for (const msg of sorted) {
    if (msg.id === message.id) break; // Don't include the new message
    if (msg.content === 'Reply in this thread to continue the conversation about this feedback.') continue;
    if (msg.author.id === botId) {
      history.push({ role: 'assistant', content: msg.content });
    } else {
      history.push({ role: 'user', content: msg.content });
    }
  }

  try {
    await message.channel.sendTyping();

    const feedbackService = new FeedbackService();
    const response = await feedbackService.getFollowUp({
      imageUrl: threadRow.imageUrl ?? undefined,
      history,
      newMessage: message.content,
    });

    await message.reply(response);
  } catch (err) {
    console.error('[feedback] Error handling follow-up:', err);
    await message.reply('❌ Something went wrong. Please try again.').catch(() => {});
  }
}
