import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { AppConfig } from '../config';
import { FeedbackService } from '../services/FeedbackService';
import { handleCommandError, AppError } from '../utils/errors';
import { db } from '../db';
import { feedbackThreads } from '../db/schema';

export const feedbackCommandData = new SlashCommandBuilder()
  .setName('feedback')
  .setDescription('Get AI feedback on thumbnails, titles, or YouTube strategy')
  .addAttachmentOption((o) =>
    o.setName('image').setDescription('Thumbnail or image to review').setRequired(false)
  )
  .addStringOption((o) =>
    o.setName('prompt').setDescription('Question or context for the feedback').setRequired(false)
  );

export async function handleFeedbackCommand(
  interaction: ChatInputCommandInteraction,
  _config: AppConfig
): Promise<void> {
  try {
    const image  = interaction.options.getAttachment('image');
    const prompt = interaction.options.getString('prompt');

    if (!image && !prompt) {
      throw new AppError('Provide an image, a prompt, or both.');
    }

    await interaction.deferReply();

    const feedbackService = new FeedbackService();
    const feedback = await feedbackService.getFeedback({
      imageUrl: image?.url,
      prompt: prompt ?? undefined,
    });

    const reply = await interaction.editReply({
      content: feedback,
      files: image ? [image.url] : undefined,
    });

    // Create a thread for follow-up conversation
    const thread = await reply.startThread({
      name: `Feedback: ${prompt?.slice(0, 80) || image?.name || 'Discussion'}`,
    });

    db.insert(feedbackThreads).values({
      threadId: thread.id,
      imageUrl: image?.url ?? null,
      originalPrompt: prompt,
      createdAt: new Date(),
    }).run();

    await thread.send('Reply in this thread to continue the conversation about this feedback.');
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
