import {
  MessageContextMenuCommandInteraction,
  ModalSubmitInteraction,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  LabelBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  ChannelType,
  MessageFlags,
} from 'discord.js';
import { AppConfig } from '../config';
import { db } from '../db';
import { client } from '../client';
import { AnnouncementService } from '../services/AnnouncementService';
import { isFounder } from '../permissions';
import { parseSessionTime } from '../utils/time';
import { AppError, handleCommandError } from '../utils/errors';

export async function handleScheduleAnnouncementContext(
  interaction: MessageContextMenuCommandInteraction,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can schedule announcements.', flags: MessageFlags.Ephemeral });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`announce-schedule:${interaction.targetId}:${interaction.channelId}`)
    .setTitle('Schedule Announcement');

  const channelLabel = new LabelBuilder()
    .setLabel('Post to channel')
    .setChannelSelectMenuComponent(
      new ChannelSelectMenuBuilder()
        .setCustomId('target_channel')
        .setPlaceholder('Select the channel to post to')
        .setChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
    );

  const timezoneLabel = new LabelBuilder()
    .setLabel('Timezone')
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId('timezone')
        .setPlaceholder('Select a timezone')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Pacific (PT)').setValue('America/Los_Angeles'),
          new StringSelectMenuOptionBuilder().setLabel('Mountain (MT)').setValue('America/Denver'),
          new StringSelectMenuOptionBuilder().setLabel('Central (CT)').setValue('America/Chicago'),
          new StringSelectMenuOptionBuilder().setLabel('Eastern (ET)').setValue('America/New_York'),
        )
    );

  modal.addLabelComponents(channelLabel, timezoneLabel);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('date')
        .setLabel('Date')
        .setPlaceholder('YYYY-MM-DD')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('time')
        .setLabel('Time (24-hour)')
        .setPlaceholder('e.g. 18:00')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

export async function handleCancelAnnouncementContext(
  interaction: MessageContextMenuCommandInteraction,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can cancel announcements.', flags: MessageFlags.Ephemeral });
    return;
  }

  const announcementService = new AnnouncementService(db, client);
  const entry = announcementService.cancel(interaction.targetId);

  if (!entry) {
    await interaction.reply({
      content: '❌ No pending announcement found for this message — it may have already been sent or cancelled.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.targetMessage.edit({ content: '~~📣 Announcement scheduled.~~ ❌ Cancelled.' });
  await interaction.reply({ content: `📣 Announcement cancelled by <@${interaction.user.id}>.` });
}

export async function handleRescheduleAnnouncementContext(
  interaction: MessageContextMenuCommandInteraction,
  config: AppConfig
): Promise<void> {
  if (!isFounder(interaction.member!, config)) {
    await interaction.reply({ content: '❌ Only Founders can reschedule announcements.', flags: MessageFlags.Ephemeral });
    return;
  }

  const announcementService = new AnnouncementService(db, client);
  // Verify there's a pending announcement for this confirmation message before showing the modal
  const existing = announcementService.findByConfirmMessage(interaction.targetId);
  if (!existing) {
    await interaction.reply({
      content: '❌ No pending announcement found for this message — it may have already been sent or cancelled.',
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(`announce-reschedule:${interaction.targetId}`)
    .setTitle('Reschedule Announcement');

  const timezoneLabel = new LabelBuilder()
    .setLabel('Timezone')
    .setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId('timezone')
        .setPlaceholder('Select a timezone')
        .addOptions(
          new StringSelectMenuOptionBuilder().setLabel('Pacific (PT)').setValue('America/Los_Angeles'),
          new StringSelectMenuOptionBuilder().setLabel('Mountain (MT)').setValue('America/Denver'),
          new StringSelectMenuOptionBuilder().setLabel('Central (CT)').setValue('America/Chicago'),
          new StringSelectMenuOptionBuilder().setLabel('Eastern (ET)').setValue('America/New_York'),
        )
    );

  modal.addLabelComponents(timezoneLabel);

  modal.addComponents(
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('date')
        .setLabel('Date')
        .setPlaceholder('YYYY-MM-DD')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
    new ActionRowBuilder<TextInputBuilder>().addComponents(
      new TextInputBuilder()
        .setCustomId('time')
        .setLabel('Time (24-hour)')
        .setPlaceholder('e.g. 18:00')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
    ),
  );

  await interaction.showModal(modal);
}

export async function handleRescheduleAnnouncementModal(
  interaction: ModalSubmitInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply();

    const [, confirmMessageId] = interaction.customId.split(':');

    const timezoneValues = interaction.fields.getStringSelectValues('timezone');
    const timezone = timezoneValues[0];
    const dateStr = interaction.fields.getTextInputValue('date').trim();
    const timeStr = interaction.fields.getTextInputValue('time').trim();

    if (!timezone) throw new AppError('No timezone selected.');

    const sendAt = parseSessionTime(dateStr, timeStr, timezone);

    const announcementService = new AnnouncementService(db, client);
    const entry = announcementService.reschedule(confirmMessageId, sendAt);

    if (!entry) {
      throw new AppError('No pending announcement found — it may have already been sent or cancelled.');
    }

    const ts = Math.floor(sendAt.getTime() / 1000);

    // Update the original confirmation message
    if (entry.confirmChannelId && entry.confirmMessageId) {
      try {
        const confirmChannel = await client.channels.fetch(entry.confirmChannelId);
        if (confirmChannel && 'messages' in confirmChannel) {
          const confirmMsg = await confirmChannel.messages.fetch(entry.confirmMessageId);
          await confirmMsg.edit(
            `📣 Announcement scheduled.\n📨 Will post to <#${entry.targetChannelId}>\n🕐 <t:${ts}:F> (<t:${ts}:R>)`
          );
        }
      } catch {
        // Best-effort
      }
    }

    await interaction.editReply({
      content: `📣 Announcement rescheduled.\n📨 Will post to <#${entry.targetChannelId}>\n🕐 <t:${ts}:F> (<t:${ts}:R>)`,
    });
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}

export async function handleScheduleAnnouncementModal(
  interaction: ModalSubmitInteraction,
  config: AppConfig
): Promise<void> {
  try {
    await interaction.deferReply();

    const [, messageId, sourceChannelId] = interaction.customId.split(':');

    const targetChannels = interaction.fields.getSelectedChannels('target_channel', true);
    const targetChannelId = targetChannels.first()?.id;
    const timezoneValues = interaction.fields.getStringSelectValues('timezone');
    const timezone = timezoneValues[0];
    const dateStr = interaction.fields.getTextInputValue('date').trim();
    const timeStr = interaction.fields.getTextInputValue('time').trim();

    if (!targetChannelId) throw new AppError('No target channel selected.');
    if (!timezone)        throw new AppError('No timezone selected.');

    const sendAt = parseSessionTime(dateStr, timeStr, timezone);

    const announcementService = new AnnouncementService(db, client);
    const entry = announcementService.schedule(
      messageId,
      sourceChannelId,
      targetChannelId,
      sendAt,
      interaction.user.id
    );

    const ts = Math.floor(sendAt.getTime() / 1000);
    const reply = await interaction.editReply({
      content: `📣 Announcement scheduled.\n📨 Will post to <#${targetChannelId}>\n🕐 <t:${ts}:F> (<t:${ts}:R>)`,
    });
    if (interaction.channelId) {
      announcementService.saveConfirmMessage(entry.id, reply.id, interaction.channelId);
    }
  } catch (err) {
    await handleCommandError(interaction, err);
  }
}
