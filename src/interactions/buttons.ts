import { ButtonInteraction, MessageFlags } from 'discord.js';
import { AppConfig } from '../config';
import { db } from '../db';
import { client } from '../client';
import { GameService } from '../services/GameService';
import { ThreadService } from '../services/ThreadService';
import { ScheduleService } from '../services/ScheduleService';
import { AuditService } from '../services/AuditService';
import { isFounder, canManageGame } from '../permissions';

async function handleFinishConfirm(
  interaction: ButtonInteraction,
  gameId: number,
  config: AppConfig
): Promise<void> {
  const gameService = new GameService(db, client);
  const game = gameService.getGame(gameId);

  if (!canManageGame(interaction.member!, game, config)) {
    await interaction.reply({ content: '❌ Only Founders or the game GM can finish this game.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.update({ content: '⏳ Finishing game...', embeds: [], components: [] });

  await gameService.setStatus(gameId, 'finished', interaction.user.id, config);

  const scheduleService = new ScheduleService(db, client, config);
  await scheduleService.renderSchedule();

  await interaction.editReply({ content: `🏁 **${game.title}** has been marked as finished. The role has been released and the thread archived.` });
}

export async function handleButtonInteraction(
  interaction: ButtonInteraction,
  config: AppConfig
): Promise<void> {
  const parts = interaction.customId.split(':');
  const [decision, action, ...rest] = parts;

  if (decision === 'cancel') {
    await interaction.update({ content: 'Action cancelled.', embeds: [], components: [] });
    return;
  }

  if (decision !== 'confirm') return;

  try {
    switch (action) {
      case 'archive': {
        const gameId = parseInt(rest[0]);
        await handleArchiveConfirm(interaction, gameId, config);
        break;
      }
      case 'clear': {
        const gameId = parseInt(rest[0]);
        await handleClearConfirm(interaction, gameId, config);
        break;
      }
      case 'finish': {
        const gameId = parseInt(rest[0]);
        await handleFinishConfirm(interaction, gameId, config);
        break;
      }
      case 'rebuild-schedule': {
        await handleRebuildScheduleConfirm(interaction, config);
        break;
      }
      case 'relink-thread': {
        const gameId = parseInt(rest[0]);
        const threadId = rest[1];
        await handleRelinkThreadConfirm(interaction, gameId, threadId, config);
        break;
      }
      case 'delete-game': {
        const gameId = parseInt(rest[0]);
        await handleDeleteGameConfirm(interaction, gameId, config);
        break;
      }
      default:
        await interaction.reply({ content: 'Unknown action.', flags: MessageFlags.Ephemeral });
    }
  } catch (err) {
    console.error('[buttons] Error handling button:', err);
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    if (interaction.replied || interaction.deferred) {
      await interaction.editReply({ content: `❌ ${msg}`, embeds: [], components: [] });
    } else {
      await interaction.update({ content: `❌ ${msg}`, embeds: [], components: [] });
    }
  }
}

async function handleArchiveConfirm(
  interaction: ButtonInteraction,
  gameId: number,
  config: AppConfig
): Promise<void> {
  // Re-validate permission at click time
  const gameService = new GameService(db, client);
  const game = gameService.getGame(gameId);

  if (!canManageGame(interaction.member!, game, config)) {
    await interaction.reply({ content: '❌ You no longer have permission to archive this game.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.update({ content: '⏳ Archiving game...', embeds: [], components: [] });

  await gameService.setStatus(gameId, 'archived', interaction.user.id, config);

  const scheduleService = new ScheduleService(db, client, config);
  await scheduleService.renderSchedule();

  await interaction.editReply({ content: `✅ **${game.title}** has been archived. The role has been removed from all members.` });
}

async function handleClearConfirm(
  interaction: ButtonInteraction,
  gameId: number,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can clear games.', flags: MessageFlags.Ephemeral });
    return;
  }

  const gameService = new GameService(db, client);
  const game = gameService.getGame(gameId);

  await interaction.update({ content: '⏳ Clearing game...', embeds: [], components: [] });

  await gameService.setStatus(gameId, 'cleared', interaction.user.id, config);

  const scheduleService = new ScheduleService(db, client, config);
  await scheduleService.renderSchedule();

  await interaction.editReply({ content: `✅ **${game.title}** has been fully cleared.` });
}

async function handleRebuildScheduleConfirm(
  interaction: ButtonInteraction,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can rebuild the schedule.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.update({ content: '⏳ Rebuilding schedule...', embeds: [], components: [] });

  const auditService = new AuditService(db);
  auditService.log(interaction.user.id, 'repair.rebuild_schedule', 'schedule');

  const scheduleService = new ScheduleService(db, client, config);
  await scheduleService.renderSchedule();

  await interaction.editReply({ content: '✅ Schedule rebuilt.' });
}

async function handleDeleteGameConfirm(
  interaction: ButtonInteraction,
  gameId: number,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can delete games.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.update({ content: '⏳ Deleting game...', embeds: [], components: [] });

  const gameService = new GameService(db, client);
  const title = await gameService.deleteGame(gameId, interaction.user.id, config);

  const scheduleService = new ScheduleService(db, client, config);
  await scheduleService.renderSchedule();

  await interaction.editReply({ content: `✅ **${title}** has been permanently deleted.` });
}

async function handleRelinkThreadConfirm(
  interaction: ButtonInteraction,
  gameId: number,
  threadId: string,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can relink threads.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.update({ content: '⏳ Relinking thread...', embeds: [], components: [] });

  const threadService = new ThreadService(db, client);
  await threadService.relinkThread(gameId, threadId);

  const auditService = new AuditService(db);
  auditService.log(interaction.user.id, 'repair.relink_thread', 'game', gameId, { threadId });

  await interaction.editReply({ content: `✅ Thread <#${threadId}> linked to game #${gameId}.` });
}
