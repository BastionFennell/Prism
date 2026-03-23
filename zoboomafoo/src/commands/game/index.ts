import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { createSubcommand, handleCreate } from './create';
import { infoSubcommand, handleInfo } from './info';
import { addPlayerSubcommand, handleAddPlayer } from './add-player';
import { removePlayerSubcommand, handleRemovePlayer } from './remove-player';
import { setRoleSubcommand, handleSetRole } from './set-role';
import { statusSubcommand, handleStatus } from './status';
import { finishSubcommand, handleFinish } from './finish';
import { archiveSubcommand, handleArchive } from './archive';
import { listSubcommand, handleList } from './list';

export const gameCommandData = new SlashCommandBuilder()
  .setName('game')
  .setDescription('Manage games')
  .addSubcommand(createSubcommand)
  .addSubcommand(infoSubcommand)
  .addSubcommand(addPlayerSubcommand)
  .addSubcommand(removePlayerSubcommand)
  .addSubcommand(setRoleSubcommand)
  .addSubcommand(statusSubcommand)
  .addSubcommand(finishSubcommand)
  .addSubcommand(archiveSubcommand)
  .addSubcommand(listSubcommand);

export async function handleGameCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const handlers: Record<string, (i: ChatInputCommandInteraction, c: AppConfig) => Promise<void>> = {
    create: handleCreate,
    info: handleInfo,
    'add-player': handleAddPlayer,
    'remove-player': handleRemovePlayer,
    'set-role': handleSetRole,
    status: handleStatus,
    finish: handleFinish,
    archive: handleArchive,
    list: handleList,
  };

  const handler = handlers[sub];
  if (handler) await handler(interaction, config);
}
