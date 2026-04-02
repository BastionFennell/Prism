import { ChatInputCommandInteraction } from 'discord.js';

export class AppError extends Error {
  constructor(
    public readonly userMessage: string,
    message?: string
  ) {
    super(message ?? userMessage);
    this.name = 'AppError';
  }
}

export async function replyError(
  interaction: ChatInputCommandInteraction,
  message: string
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ content: `❌ ${message}` });
  } else {
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
  }
}

export async function handleCommandError(
  interaction: ChatInputCommandInteraction,
  err: unknown
): Promise<void> {
  if (err instanceof AppError) {
    await replyError(interaction, err.userMessage);
  } else {
    console.error(`[error] Unhandled error in command ${interaction.commandName}:`, err);
    await replyError(interaction, 'An unexpected error occurred. Please try again.');
  }
}
