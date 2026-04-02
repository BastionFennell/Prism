import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { addSubcommand, handleAdd } from './add';
import { editSubcommand, handleEdit } from './edit';
import { removeSubcommand, handleRemove } from './remove';
import { listSubcommand, handleList } from './list';
import { userSubcommand, handleUser } from './user';

export const characterCommandData = new SlashCommandBuilder()
  .setName('character')
  .setDescription('Manage game characters')
  .addSubcommand(addSubcommand)
  .addSubcommand(editSubcommand)
  .addSubcommand(removeSubcommand)
  .addSubcommand(listSubcommand)
  .addSubcommand(userSubcommand);

export async function handleCharacterCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const handlers: Record<string, (i: ChatInputCommandInteraction, c: AppConfig) => Promise<void>> = {
    add: handleAdd,
    edit: handleEdit,
    remove: handleRemove,
    list: handleList,
    user: handleUser,
  };

  const handler = handlers[sub];
  if (handler) {
    await handler(interaction, config);
  }
}
