import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { createSubcommand, handleCreate } from './create';
import { infoSubcommand, handleInfo } from './info';
import { joinSubcommand, handleJoin } from './join';
import { leaveSubcommand, handleLeave } from './leave';
import { pauseSubcommand, handlePause } from './pause';
import { resumeSubcommand, handleResume } from './resume';
import { archiveSubcommand, handleArchive } from './archive';
import { clearSubcommand, handleClear } from './clear';
import { listSubcommand, handleList } from './list';
import { statusSubcommand, handleStatus } from './status';
import { finishSubcommand, handleFinish } from './finish';

export const gameCommandData = new SlashCommandBuilder()
  .setName('game')
  .setDescription('Manage community games')
  .addSubcommand(createSubcommand)
  .addSubcommand(infoSubcommand)
  .addSubcommand(joinSubcommand)
  .addSubcommand(leaveSubcommand)
  .addSubcommand(statusSubcommand)
  .addSubcommand(pauseSubcommand)
  .addSubcommand(resumeSubcommand)
  .addSubcommand(archiveSubcommand)
  .addSubcommand(clearSubcommand)
  .addSubcommand(finishSubcommand)
  .addSubcommand(listSubcommand);

export async function handleGameCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const handlers: Record<string, (i: ChatInputCommandInteraction, c: AppConfig) => Promise<void>> = {
    create: handleCreate,
    info: handleInfo,
    join: handleJoin,
    leave: handleLeave,
    status: handleStatus,
    pause: handlePause,
    resume: handleResume,
    archive: handleArchive,
    clear: handleClear,
    finish: handleFinish,
    list: handleList,
  };

  const handler = handlers[sub];
  if (handler) {
    await handler(interaction, config);
  }
}
