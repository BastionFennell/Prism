import { ChatInputCommandInteraction, ModalSubmitInteraction } from 'discord.js';

export class AppError extends Error {
  constructor(
    public readonly userMessage: string,
    message?: string
  ) {
    super(message ?? userMessage);
    this.name = 'AppError';
  }
}

type RepliableInteraction = ChatInputCommandInteraction | ModalSubmitInteraction;

export async function replyError(
  interaction: RepliableInteraction,
  message: string
): Promise<void> {
  if (interaction.replied || interaction.deferred) {
    await interaction.editReply({ content: `❌ ${message}` });
  } else {
    await interaction.reply({ content: `❌ ${message}`, ephemeral: true });
  }
}

export async function handleCommandError(
  interaction: RepliableInteraction,
  err: unknown
): Promise<void> {
  if (err instanceof AppError) {
    await replyError(interaction, err.userMessage);
  } else {
    const name = 'commandName' in interaction ? interaction.commandName : interaction.customId;
    console.error(`[error] Unhandled error in command ${name}:`, err);
    await replyError(interaction, 'An unexpected error occurred. Please try again.');
  }
}
