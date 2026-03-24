import { Client, TextChannel, EmbedBuilder, Colors } from 'discord.js';
import { eq, asc, inArray } from 'drizzle-orm';
import { DB } from '../db';
import { sessions, games, gameMemberships, schedulePosts, botConfig, rsvps, Session, Game, Rsvp } from '../db/schema';
import { AppConfig } from '../config';
import { discordTimestamp } from '../utils/time';

const MAX_EMBEDS_PER_MESSAGE = 10;
const MAX_EMBED_CHARS_PER_MESSAGE = 5500;

export class ScheduleService {
  constructor(
    private readonly db: DB,
    private readonly client: Client,
    private readonly config: AppConfig
  ) {}

  // ── Global schedule (all games → scheduleChannelId) ──────────────────────

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

    const maxPosition = Math.max(messagePayloads.length, existingPosts.length);

    for (let i = 0; i < maxPosition; i++) {
      const payload = messagePayloads[i];
      const existingPost = existingPosts[i];

      if (payload && existingPost) {
        try {
          const msg = await channel.messages.fetch(existingPost.messageId);
          await msg.edit({ embeds: payload });
          this.db
            .update(schedulePosts)
            .set({ updatedAt: new Date() })
            .where(eq(schedulePosts.id, existingPost.id))
            .run();
        } catch {
          const sent = await channel.send({ embeds: payload });
          this.db
            .update(schedulePosts)
            .set({ messageId: sent.id, updatedAt: new Date() })
            .where(eq(schedulePosts.id, existingPost.id))
            .run();
        }
      } else if (payload && !existingPost) {
        const sent = await channel.send({ embeds: payload });
        this.db
          .insert(schedulePosts)
          .values({ messageId: sent.id, position: i, updatedAt: new Date() })
          .run();
      } else if (!payload && existingPost) {
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

  // ── Per-game schedule (one game → game channel) ───────────────────────────

  async renderGameSchedule(gameId: number): Promise<void> {
    const [game] = this.db.select().from(games).where(eq(games.id, gameId)).all();
    if (!game?.discordChannelId) return;

    const channel = await this.client.channels.fetch(game.discordChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const embed = this.buildGameScheduleEmbed(gameId, game.title);
    const existingId = game.scheduleMessageId;

    if (existingId) {
      try {
        const msg = await channel.messages.fetch(existingId);
        await msg.edit({ embeds: [embed] });
        return;
      } catch {
        // Message deleted — fall through
      }
    }

    const sent = await channel.send({ embeds: [embed] });
    await sent.pin();
    this.db
      .update(games)
      .set({ scheduleMessageId: sent.id, updatedAt: new Date() })
      .where(eq(games.id, gameId))
      .run();
  }

  // ── Per-session announcement (game channel, with reactions) ──────────────

  async postSessionAnnouncement(session: Session, game: Game): Promise<void> {
    if (!game.discordChannelId) return;

    const channel = await this.client.channels.fetch(game.discordChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    const embed = this.buildSessionAnnouncementEmbed(session, game.title, []);
    const msg = await channel.send({ embeds: [embed] });

    await msg.react('✅');
    await msg.react('❌');
    await msg.react('❓');

    this.db
      .update(sessions)
      .set({ rsvpMessageId: msg.id, updatedAt: new Date() })
      .where(eq(sessions.id, session.id))
      .run();
  }

  async updateSessionAnnouncement(sessionId: number, game: Game): Promise<void> {
    const [session] = this.db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
    if (!session?.rsvpMessageId || !game.discordChannelId) return;

    const channel = await this.client.channels.fetch(game.discordChannelId);
    if (!channel || !(channel instanceof TextChannel)) return;

    try {
      const msg = await channel.messages.fetch(session.rsvpMessageId);
      const sessionRsvps = this.db.select().from(rsvps).where(eq(rsvps.sessionId, sessionId)).all();
      const embed = this.buildSessionAnnouncementEmbed(session, game.title, sessionRsvps);
      await msg.edit({ embeds: [embed] });
    } catch {
      // Message was deleted — nothing to update
    }
  }

  // ── Embed builders ────────────────────────────────────────────────────────

  buildSessionAnnouncementEmbed(session: Session, gameTitle: string, rsvpList: Rsvp[]): EmbedBuilder {
    const embed = new EmbedBuilder()
      .setTitle(`📅 ${gameTitle} — ${session.title ?? 'Session'}`)
      .setColor(Colors.Blurple)
      .addFields({
        name: '🕐 When',
        value: `${discordTimestamp(session.startAt, 'F')}\n${discordTimestamp(session.startAt, 'R')}`,
        inline: true,
      });

    if (session.durationMinutes) {
      embed.addFields({ name: '⏱ Duration', value: `${session.durationMinutes} min`, inline: true });
    }

    if (session.notes) {
      embed.addFields({ name: 'Notes', value: session.notes.slice(0, 400), inline: false });
    }

    const yes   = rsvpList.filter((r) => r.response === 'yes');
    const no    = rsvpList.filter((r) => r.response === 'no');
    const maybe = rsvpList.filter((r) => r.response === 'maybe');

    const fmt = (list: Rsvp[]) => list.length ? list.map((r) => `<@${r.userId}>`).join(' ') : '—';

    embed.addFields({
      name: 'RSVPs',
      value: `✅ ${fmt(yes)}\n❌ ${fmt(no)}\n❓ ${fmt(maybe)}`.slice(0, 1024),
      inline: false,
    });

    embed.setFooter({ text: `Session ID: ${session.id} · React ✅ ❌ ❓ to RSVP` });

    return embed;
  }

  private buildRosterEmbed(): EmbedBuilder {
    const statusEmoji: Record<string, string> = { active: '🔵', paused: '🟡' };

    const activeGames = this.db
      .select()
      .from(games)
      .where(inArray(games.status, ['active', 'paused']))
      .orderBy(asc(games.title))
      .all();

    const embed = new EmbedBuilder()
      .setTitle('🎮 Games')
      .setColor(Colors.Green);

    if (activeGames.length === 0) {
      embed.setDescription('No games are currently active.');
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

      const channel = g.discordChannelId ? ` · <#${g.discordChannelId}>` : '';

      return `${emoji} **${g.title}**${system} — <@${g.gmUserId}> · ${playerCount} player${playerCount !== 1 ? 's' : ''}${channel}`;
    });

    embed.setDescription(lines.join('\n'));
    return embed;
  }

  private buildGameScheduleEmbed(gameId: number, gameTitle: string): EmbedBuilder {
    const now = new Date();

    const upcomingSessions = this.db
      .select()
      .from(sessions)
      .where(eq(sessions.gameId, gameId))
      .orderBy(asc(sessions.startAt))
      .all()
      .filter((s) => s.status === 'scheduled' && s.startAt > now);

    const embed = new EmbedBuilder()
      .setTitle(`📅 ${gameTitle} — Upcoming Sessions`)
      .setColor(Colors.Blurple);

    if (upcomingSessions.length === 0) {
      embed.setDescription('No sessions are currently scheduled.');
      return embed;
    }

    const lines = upcomingSessions.map((s) => {
      const title = s.title ? `**${s.title}**` : 'Session';
      return `${title}\n${discordTimestamp(s.startAt, 'F')} · ${discordTimestamp(s.startAt, 'R')}`;
    });

    embed.setDescription(lines.join('\n\n'));
    return embed;
  }

  private buildSchedulePayloads(): EmbedBuilder[][] {
    const now = new Date();
    const statusEmoji: Record<string, string> = { active: '🔵', paused: '🟡' };

    const activeGames = this.db
      .select()
      .from(games)
      .where(inArray(games.status, ['active', 'paused']))
      .orderBy(asc(games.title))
      .all();

    if (activeGames.length === 0) {
      return [[new EmbedBuilder()
        .setTitle('📅 Schedule')
        .setDescription('No games are currently active.')
        .setColor(Colors.Grey)]];
    }

    // Build fields — one per game, listing its upcoming sessions.
    // Split into multiple embeds if we hit Discord's 25-field limit.
    const messages: EmbedBuilder[][] = [];
    let embed = new EmbedBuilder().setTitle('📅 Schedule').setColor(Colors.Blurple);
    let fieldCount = 0;

    for (const game of activeGames) {
      const upcomingSessions = this.db
        .select()
        .from(sessions)
        .where(eq(sessions.gameId, game.id))
        .orderBy(asc(sessions.startAt))
        .all()
        .filter((s) => s.status === 'scheduled' && s.startAt > now);

      const emoji = statusEmoji[game.status] ?? '⚪';
      const channel = game.discordChannelId ? ` · <#${game.discordChannelId}>` : '';
      const fieldName = `${emoji} ${game.title}${channel}`;

      const fieldValue = upcomingSessions.length === 0
        ? '*No sessions scheduled*'
        : upcomingSessions
            .map((s) => `${discordTimestamp(s.startAt, 'F')} · ${discordTimestamp(s.startAt, 'R')}`)
            .join('\n')
            .slice(0, 1024);

      if (fieldCount >= 25) {
        messages.push([embed]);
        embed = new EmbedBuilder().setTitle('📅 Schedule (cont.)').setColor(Colors.Blurple);
        fieldCount = 0;
      }

      embed.addFields({ name: fieldName, value: fieldValue, inline: false });
      fieldCount++;
    }

    messages.push([embed]);
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
