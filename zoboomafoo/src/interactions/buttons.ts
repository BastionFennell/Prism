import { ButtonInteraction, MessageFlags } from 'discord.js';
import { AppConfig } from '../config';
import { db } from '../db';
import { client } from '../client';
import { GameService } from '../services/GameService';
import { ScheduleService } from '../services/ScheduleService';
import { SchedulingPollService } from '../services/SchedulingPollService';
import { AuditService } from '../services/AuditService';
import { isFounder } from '../permissions';

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
      case 'finish': {
        const gameId = parseInt(rest[0]);
        await handleFinishConfirm(interaction, gameId, config);
        break;
      }
      case 'archive': {
        const gameId = parseInt(rest[0]);
        await handleArchiveConfirm(interaction, gameId, config);
        break;
      }
      case 'remove-player': {
        const gameId = parseInt(rest[0]);
        const userId = rest[1];
        await handleRemovePlayerConfirm(interaction, gameId, userId, config);
        break;
      }
      case 'rebuild-schedule': {
        await handleRebuildScheduleConfirm(interaction, config);
        break;
      }
      case 'relink': {
        const gameId = parseInt(rest[0]);
        const channelId = rest[1] || undefined;
        const roleId = rest[2] || undefined;
        await handleRelinkConfirm(interaction, gameId, channelId, roleId, config);
        break;
      }
      case 'delete-game': {
        const gameId = parseInt(rest[0]);
        await handleDeleteGameConfirm(interaction, gameId, config);
        break;
      }
      case 'schedule': {
        const localPollId = parseInt(rest[0]);
        const winningLabel = rest.slice(1).join(':');
        await handleScheduleConfirm(interaction, localPollId, winningLabel, config);
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

async function handleFinishConfirm(
  interaction: ButtonInteraction,
  gameId: number,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can finish games.', flags: MessageFlags.Ephemeral });
    return;
  }

  const gameService = new GameService(db, client);
  const game = gameService.getGame(gameId);

  await interaction.update({ content: '⏳ Finishing game...', embeds: [], components: [] });
  await gameService.setStatus(gameId, 'finished', interaction.user.id, config);

  const scheduleService = new ScheduleService(db, client, config);
  await scheduleService.renderSchedule();

  await interaction.editReply({ content: `🏁 **${game.title}** has been marked as finished. The role has been released and the channel archived.` });
}

async function handleArchiveConfirm(
  interaction: ButtonInteraction,
  gameId: number,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can archive games.', flags: MessageFlags.Ephemeral });
    return;
  }

  const gameService = new GameService(db, client);
  const game = gameService.getGame(gameId);

  await interaction.update({ content: '⏳ Archiving game...', embeds: [], components: [] });
  await gameService.setStatus(gameId, 'archived', interaction.user.id, config);

  const scheduleService = new ScheduleService(db, client, config);
  await scheduleService.renderSchedule();

  await interaction.editReply({ content: `⚫ **${game.title}** has been archived. The role has been released and the channel archived.` });
}

async function handleRemovePlayerConfirm(
  interaction: ButtonInteraction,
  gameId: number,
  userId: string,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can remove players.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.update({ content: '⏳ Removing player...', embeds: [], components: [] });

  const gameService = new GameService(db, client);
  await gameService.removePlayer(gameId, userId, interaction.user.id, config);

  await interaction.editReply({ content: `✅ <@${userId}> has been removed from the game.` });
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

async function handleRelinkConfirm(
  interaction: ButtonInteraction,
  gameId: number,
  channelId: string | undefined,
  roleId: string | undefined,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can relink games.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.update({ content: '⏳ Relinking...', embeds: [], components: [] });

  const gameService = new GameService(db, client);
  await gameService.relinkGame(gameId, channelId, roleId, interaction.user.id, config);

  const parts: string[] = [];
  if (channelId) parts.push(`channel → <#${channelId}>`);
  if (roleId) parts.push(`role → <@&${roleId}>`);

  await interaction.editReply({ content: `✅ Game #${gameId} updated: ${parts.join(', ')}.` });
}

async function handleScheduleConfirm(
  interaction: ButtonInteraction,
  localPollId: number,
  winningLabel: string,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can schedule sessions.', flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.update({ content: '⏳ Scheduling session...', components: [] });

  const pollService = new SchedulingPollService(db, client, config);
  await pollService.confirmAndSchedule(localPollId, winningLabel, interaction.user.id);

  await interaction.editReply({ content: `✅ Session scheduled for **${winningLabel}**! Check the channel for the announcement.` });
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
