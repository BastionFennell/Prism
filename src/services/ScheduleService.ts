import { Client, TextChannel, EmbedBuilder, Colors } from 'discord.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { DB } from '../db';
import { sessions, games, gameMemberships, schedulePosts, botConfig, rsvps } from '../db/schema';
import { AppConfig } from '../config';
import { discordTimestamp } from '../utils/time';

const MAX_EMBEDS_PER_MESSAGE = 10;
// Discord limit: 6000 chars total embed content per message
const MAX_EMBED_CHARS_PER_MESSAGE = 5500;

export class ScheduleService {
  constructor(
    private readonly db: DB,
    private readonly client: Client,
    private readonly config: AppConfig
  ) {}

  async renderRoster(): Promise<void> {
    if (!this.config.scheduleChannelId) return;

    const channel = await this.client.channels.fetch(this.config.scheduleChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const embed = this.buildRosterEmbed();
    const [cfg] = this.db.select().from(botConfig).all();
    const existingId = cfg?.rosterMessageId ?? null;

    if (existingId) {
      try {
        const msg = await channel.messages.fetch(existingId);
        await msg.edit({ embeds: [embed] });
        return;
      } catch {
        // Message was deleted — fall through to send a new one
      }
    }

    const sent = await channel.send({ embeds: [embed] });
    this.db
      .update(botConfig)
      .set({ rosterMessageId: sent.id })
      .where(eq(botConfig.id, 1))
      .run();
  }

  async renderSchedule(): Promise<void> {
    if (!this.config.scheduleChannelId) return;

    await this.renderRoster();

    const channel = await this.client.channels.fetch(this.config.scheduleChannelId);
    if (!channel || !(channel instanceof TextChannel)) {
      console.warn('[ScheduleService] Schedule channel not found or not a text channel.');
      return;
    }

    const messagePayloads = this.buildSchedulePayloads();
    const existingPosts = this.db
      .select()
      .from(schedulePosts)
      .orderBy(asc(schedulePosts.position))
      .all();

    // Edit existing messages, send new ones, delete surplus
    const maxPosition = Math.max(messagePayloads.length, existingPosts.length);

    for (let i = 0; i < maxPosition; i++) {
      const payload = messagePayloads[i];
      const existingPost = existingPosts[i];

      if (payload && existingPost) {
        // Edit existing message
        try {
          const msg = await channel.messages.fetch(existingPost.messageId);
          await msg.edit({ embeds: payload });
          this.db
            .update(schedulePosts)
            .set({ updatedAt: new Date() })
            .where(eq(schedulePosts.id, existingPost.id))
            .run();
        } catch {
          // Message deleted externally — send a new one
          const sent = await channel.send({ embeds: payload });
          this.db
            .update(schedulePosts)
            .set({ messageId: sent.id, updatedAt: new Date() })
            .where(eq(schedulePosts.id, existingPost.id))
            .run();
        }
      } else if (payload && !existingPost) {
        // Send new message
        const sent = await channel.send({ embeds: payload });
        this.db
          .insert(schedulePosts)
          .values({ messageId: sent.id, position: i, updatedAt: new Date() })
          .run();
      } else if (!payload && existingPost) {
        // Delete surplus message
        try {
          const msg = await channel.messages.fetch(existingPost.messageId);
          await msg.delete();
        } catch {
          // Already deleted
        }
        this.db.delete(schedulePosts).where(eq(schedulePosts.id, existingPost.id)).run();
      }
    }
  }

  private buildRosterEmbed(): EmbedBuilder {
    const statusEmoji: Record<string, string> = { recruiting: '🟢', active: '🔵' };

    const activeGames = this.db
      .select()
      .from(games)
      .where(inArray(games.status, ['recruiting', 'active']))
      .orderBy(asc(games.title))
      .all();

    const embed = new EmbedBuilder()
      .setTitle('🎮 Community Games')
      .setColor(Colors.Green);

    if (activeGames.length === 0) {
      embed.setDescription('No games are currently recruiting or active.');
      return embed;
    }

    const lines = activeGames.map((g) => {
      const emoji = statusEmoji[g.status] ?? '❓';
      const system = g.systemName ? ` · ${g.systemName}` : '';

      const playerCount = this.db
        .select()
        .from(gameMemberships)
        .where(eq(gameMemberships.gameId, g.id))
        .all()
        .filter((m) => m.active && m.userId !== g.gmUserId).length;

      const players = g.playerCap
        ? `${playerCount}/${g.playerCap} players`
        : `${playerCount} player${playerCount !== 1 ? 's' : ''}`;

      const thread = g.discordThreadId ? ` · <#${g.discordThreadId}>` : '';

      return `${emoji} **${g.title}**${system} — <@${g.gmUserId}> · ${players}${thread}`;
    });

    embed.setDescription(lines.join('\n'));
    return embed;
  }

  private buildSchedulePayloads(): EmbedBuilder[][] {
    const now = new Date();

    const upcomingSessions = this.db
      .select({
        session: sessions,
        game: games,
      })
      .from(sessions)
      .innerJoin(games, eq(sessions.gameId, games.id))
      .where(eq(sessions.status, 'scheduled'))
      .orderBy(asc(sessions.startAt))
      .all()
      .filter((row) => row.session.startAt > now);

    if (upcomingSessions.length === 0) {
      // Show a "no upcoming sessions" placeholder
      const placeholder = new EmbedBuilder()
        .setTitle('📅 Upcoming Sessions')
        .setDescription('No sessions are currently scheduled.')
        .setColor(Colors.Grey);
      return [[placeholder]];
    }

    // Build one embed per session, then chunk into messages
    const allEmbeds = upcomingSessions.map(({ session, game }) => {
      const embed = new EmbedBuilder()
        .setTitle(`${game.title} — ${session.title ?? 'Session'}`)
        .setColor(Colors.Blurple)
        .addFields({
          name: '🕐 Date & Time',
          value: `${discordTimestamp(session.startAt, 'F')}\n${discordTimestamp(session.startAt, 'R')}`,
          inline: true,
        });

      if (session.durationMinutes) {
        embed.addFields({ name: '⏱ Duration', value: `${session.durationMinutes} min`, inline: true });
      }

      embed.addFields({ name: '🎲 GM', value: `<@${game.gmUserId}>`, inline: true });

      if (session.notes) {
        embed.addFields({ name: 'Notes', value: session.notes.slice(0, 200), inline: false });
      }

      // RSVP summary — always shown, with mention lists per response
      const sessionRsvps = this.db.select().from(rsvps).where(eq(rsvps.sessionId, session.id)).all();
      const rsvpYes   = sessionRsvps.filter((r) => r.response === 'yes');
      const rsvpNo    = sessionRsvps.filter((r) => r.response === 'no');
      const rsvpMaybe = sessionRsvps.filter((r) => r.response === 'maybe');

      const fmt = (list: typeof sessionRsvps) =>
        list.length ? list.map((r) => `<@${r.userId}>`).join(' ') : '—';

      embed.addFields({
        name: `RSVPs (${sessionRsvps.length})`,
        value: `✅ **${rsvpYes.length}** ${fmt(rsvpYes)}\n❌ **${rsvpNo.length}** ${fmt(rsvpNo)}\n❓ **${rsvpMaybe.length}** ${fmt(rsvpMaybe)}`.slice(0, 1024),
        inline: false,
      });

      embed.setFooter({ text: `Game ID: ${game.id} • Session ID: ${session.id}` });

      return embed;
    });

    // Chunk embeds into message payloads
    const messages: EmbedBuilder[][] = [];
    let current: EmbedBuilder[] = [];
    let currentCharCount = 0;

    for (const embed of allEmbeds) {
      const embedCharCount = this.estimateEmbedChars(embed);

      if (
        current.length >= MAX_EMBEDS_PER_MESSAGE ||
        currentCharCount + embedCharCount > MAX_EMBED_CHARS_PER_MESSAGE
      ) {
        messages.push(current);
        current = [];
        currentCharCount = 0;
      }

      current.push(embed);
      currentCharCount += embedCharCount;
    }

    if (current.length > 0) {
      messages.push(current);
    }

    return messages;
  }

  private estimateEmbedChars(embed: EmbedBuilder): number {
    const data = embed.toJSON();
    let count = (data.title?.length ?? 0) + (data.description?.length ?? 0);
    for (const field of data.fields ?? []) {
      count += field.name.length + field.value.length;
    }
    return count;
  }
}
