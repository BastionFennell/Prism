import { ChatInputCommandInteraction, SlashCommandBuilder } from 'discord.js';
import { AppConfig } from '../../config';
import { setupSubcommand, handleSetup } from './setup';
import { rolepoolSubcommand, handleRolepool } from './rolepool';
import { resyncGameSubcommand, handleResyncGame } from './resync-game';
import { rebuildScheduleSubcommand, handleRebuildSchedule } from './rebuild-schedule';
import { inspectGameSubcommand, handleInspectGame } from './inspect-game';
import { relinkThreadSubcommand, handleRelinkThread } from './relink-thread';
import { deleteGameSubcommand, handleDeleteGame } from './delete-game';

export const adminCommandData = new SlashCommandBuilder()
  .setName('admin')
  .setDescription('Bot administration and repair commands (Founder only)')
  .addSubcommand(setupSubcommand)
  .addSubcommand(rolepoolSubcommand)
  .addSubcommand(resyncGameSubcommand)
  .addSubcommand(rebuildScheduleSubcommand)
  .addSubcommand(inspectGameSubcommand)
  .addSubcommand(relinkThreadSubcommand)
  .addSubcommand(deleteGameSubcommand);

export async function handleAdminCommand(
  interaction: ChatInputCommandInteraction,
  config: AppConfig
): Promise<void> {
  const sub = interaction.options.getSubcommand();
  const handlers: Record<string, (i: ChatInputCommandInteraction, c: AppConfig) => Promise<void>> = {
    setup: handleSetup,
    rolepool: handleRolepool,
    'resync-game': handleResyncGame,
    'rebuild-schedule': handleRebuildSchedule,
    'inspect-game': handleInspectGame,
    'relink-thread': handleRelinkThread,
    'delete-game': handleDeleteGame,
  };

  const handler = handlers[sub];
  if (handler) {
    await handler(interaction, config);
  }
}
