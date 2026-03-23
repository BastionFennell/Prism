import { EmbedBuilder, Colors } from 'discord.js';
import { Game, Session } from '../db/schema';
import { discordTimestamp } from './time';

export function gameInfoEmbed(
  game: Game,
  memberCount: number,
  nextSession: Session | null
): EmbedBuilder {
  const statusEmoji: Record<string, string> = {
    active:   '🔵',
    paused:   '🟡',
    archived: '⚫',
    finished: '🏁',
  };

  const embed = new EmbedBuilder()
    .setTitle(game.title)
    .setColor(Colors.Blurple)
    .addFields(
      { name: 'Status', value: `${statusEmoji[game.status] ?? ''} ${game.status}`, inline: true },
      { name: 'System', value: game.systemName ?? 'Unknown', inline: true },
      { name: 'GM', value: `<@${game.gmUserId}>`, inline: true },
      { name: 'Players', value: `${memberCount}`, inline: true }
    );

  if (game.description) {
    embed.setDescription(game.description);
  }

  if (game.discordChannelId) {
    embed.addFields({ name: 'Channel', value: `<#${game.discordChannelId}>`, inline: true });
  }

  if (game.discordRoleId) {
    embed.addFields({ name: 'Role', value: `<@&${game.discordRoleId}>`, inline: true });
  }

  if (nextSession) {
    const timeStr = discordTimestamp(nextSession.startAt, 'F');
    const relStr = discordTimestamp(nextSession.startAt, 'R');
    embed.addFields({
      name: 'Next Session',
      value: `${nextSession.title ?? 'Session'}\n${timeStr} (${relStr})`,
    });
  }

  embed.setFooter({ text: `Game ID: ${game.id}` });

  return embed;
}

export function sessionEmbed(session: Session, gameTitle: string): EmbedBuilder {
  const fields = [
    {
      name: 'Date & Time',
      value: `${discordTimestamp(session.startAt, 'F')}\n${discordTimestamp(session.startAt, 'R')}`,
      inline: true,
    },
  ];

  if (session.durationMinutes) {
    fields.push({ name: 'Duration', value: `${session.durationMinutes} min`, inline: true });
  }

  if (session.notes) {
    fields.push({ name: 'Notes', value: session.notes.slice(0, 200), inline: false });
  }

  return new EmbedBuilder()
    .setTitle(`${gameTitle} — ${session.title ?? 'Session'}`)
    .setColor(Colors.Green)
    .addFields(fields)
    .setFooter({ text: `Session ID: ${session.id}` });
}

export function confirmEmbed(title: string, description: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`⚠️ ${title}`)
    .setDescription(description)
    .setColor(Colors.Yellow);
}

export function successEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setDescription(`✅ ${message}`)
    .setColor(Colors.Green);
}

export function errorEmbed(message: string): EmbedBuilder {
  return new EmbedBuilder()
    .setDescription(`❌ ${message}`)
    .setColor(Colors.Red);
}
