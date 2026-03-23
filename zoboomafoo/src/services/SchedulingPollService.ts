import { Client, TextChannel, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { eq, and, inArray } from 'drizzle-orm';
import { DB } from '../db';
import { schedulingPolls, games, gameMemberships, sessions } from '../db/schema';
import { AppConfig } from '../config';
import { SessionService } from './SessionService';
import { ScheduleService } from './ScheduleService';
import { MembershipService } from './MembershipService';
import { DateTime } from 'luxon';
import * as crypto from 'crypto';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export interface PollTopSlot {
  startAt: string;       // "YYYY-MM-DDTHH:MM" local
  endAt: string;
  availableCount: number;
  totalMembers: number;
  label: string;
}

export interface CreatePollParams {
  gameId: number;
  gameName: string;
  guildId: string;
  memberDiscordIds: string[];
  dateRangeStart: string;   // ISO date
  dateRangeEnd: string;
  sessionDurationMinutes: number;
  dailyWindowStart: string; // "HH:MM"
  dailyWindowEnd: string;
  timezone: string;
  expiresAt: Date;
}

function hashTopSlots(slots: PollTopSlot[]): string {
  const str = JSON.stringify(slots.map(s => `${s.startAt}:${s.availableCount}`));
  return crypto.createHash('md5').update(str).digest('hex').slice(0, 8);
}

function formatSlotBar(count: number, total: number): string {
  if (total === 0) return '';
  const filled = Math.round((count / total) * 5);
  return '█'.repeat(filled) + '░'.repeat(5 - filled);
}

function buildCollectingEmbed(
  gameName: string,
  pollUrl: string,
  voterCount: number,
  totalMembers: number,
  topSlots: PollTopSlot[],
  expiresAt: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.Purple)
    .setTitle(`📅  Schedule a session — ${gameName}`)
    .setDescription(`🔗  [Vote on your availability](${pollUrl})\n\nPlayers voted: **${voterCount} / ${totalMembers}**`)
    .setFooter({ text: `Poll closes ${new Date(expiresAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · /session schedule-end to close early` });

  if (topSlots.length > 0) {
    const slotLines = topSlots
      .map((s, i) => `\`${i + 1}.\` **${s.label}**  ${formatSlotBar(s.availableCount, s.totalMembers)} ${s.availableCount}/${s.totalMembers}`)
      .join('\n');
    embed.addFields({ name: 'Top availability spots', value: slotLines });
  } else {
    embed.addFields({ name: 'Top availability spots', value: '*No votes yet*' });
  }

  return embed;
}

export class SchedulingPollService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DB,
    private readonly client: Client,
    private readonly config: AppConfig
  ) {}

  start(): void {
    if (this.intervalId) return;
    this.checkPollUpdates().catch(console.error);
    this.intervalId = setInterval(() => {
      this.checkPollUpdates().catch(console.error);
    }, POLL_INTERVAL_MS);
    console.log('[SchedulingPollService] Started polling every 5 minutes.');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // ── Create poll ───────────────────────────────────────────────────────────

  async createPoll(params: CreatePollParams): Promise<string> {
    const url = process.env.STREAMING_RAINBOW_URL;
    const key = process.env.STREAMING_RAINBOW_API_KEY;
    if (!url || !key) throw new Error('STREAMING_RAINBOW_URL or STREAMING_RAINBOW_API_KEY not set');

    const res = await fetch(`${url}/api/internal/polls`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        guildId: params.guildId,
        gameId: params.gameId,
        gameName: params.gameName,
        memberDiscordIds: params.memberDiscordIds,
        dateRangeStart: params.dateRangeStart,
        dateRangeEnd: params.dateRangeEnd,
        sessionDurationMinutes: params.sessionDurationMinutes,
        dailyWindowStart: params.dailyWindowStart,
        dailyWindowEnd: params.dailyWindowEnd,
        timezone: params.timezone,
        expiresAt: params.expiresAt.toISOString(),
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Streaming Rainbow API error: ${res.status} ${text}`);
    }

    const { pollId } = await res.json();
    return pollId as string;
  }

  // ── End collection early ──────────────────────────────────────────────────

  async endCollection(localPollId: number): Promise<void> {
    const [poll] = this.db
      .select()
      .from(schedulingPolls)
      .where(eq(schedulingPolls.id, localPollId))
      .all();
    if (!poll || poll.status !== 'collecting') return;

    await this.callPollEnd(poll.remotePollId);
    await this.transitionToVoting(poll);
  }

  // ── Main polling loop ─────────────────────────────────────────────────────

  private async checkPollUpdates(): Promise<void> {
    const collectingPolls = this.db
      .select()
      .from(schedulingPolls)
      .where(eq(schedulingPolls.status, 'collecting'))
      .all();

    for (const poll of collectingPolls) {
      await this.checkCollectingPoll(poll).catch(err => {
        console.warn(`[SchedulingPollService] Error checking poll ${poll.id}:`, err);
      });
    }

    const votingPolls = this.db
      .select()
      .from(schedulingPolls)
      .where(eq(schedulingPolls.status, 'voting'))
      .all();

    for (const poll of votingPolls) {
      await this.checkVotingPoll(poll).catch(err => {
        console.warn(`[SchedulingPollService] Error checking voting poll ${poll.id}:`, err);
      });
    }
  }

  private async checkCollectingPoll(
    poll: typeof schedulingPolls.$inferSelect
  ): Promise<void> {
    const data = await this.fetchRemotePoll(poll.remotePollId);
    if (!data) return;

    const [game] = this.db.select().from(games).where(eq(games.id, poll.gameId)).all();
    if (!game?.discordChannelId) return;

    // Update embed if top slots changed
    const newHash = hashTopSlots(data.topSlots);
    if (newHash !== poll.lastTopSlotsHash && poll.discordEmbedMessageId) {
      await this.updateCollectingEmbed(
        game,
        poll,
        data.topSlots,
        data.voterCount,
        data.totalMembers
      );
      this.db
        .update(schedulingPolls)
        .set({ lastTopSlotsHash: newHash })
        .where(eq(schedulingPolls.id, poll.id))
        .run();
    }

    // Transition to voting if all voted or expired
    const expired = Date.now() >= poll.expiresAt;
    if (data.allMembersVoted || expired) {
      console.log(`[SchedulingPollService] Poll ${poll.id} ready for voting (allVoted=${data.allMembersVoted}, expired=${expired})`);
      await this.callPollEnd(poll.remotePollId);
      await this.transitionToVoting(poll, data.topSlots);
    }
  }

  private async checkVotingPoll(
    poll: typeof schedulingPolls.$inferSelect
  ): Promise<void> {
    if (!poll.discordPollMessageId) return;

    const [game] = this.db.select().from(games).where(eq(games.id, poll.gameId)).all();
    if (!game?.discordChannelId) return;

    try {
      const channel = await this.client.channels.fetch(game.discordChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const msg = await channel.messages.fetch(poll.discordPollMessageId);
      if (!msg.poll) return;

      // Check if poll is finalized
      const isFinalized = (msg.poll as any).resultsFinalized ?? false;
      if (!isFinalized) return;

      // Find winning answer
      const answers: Array<{ text: string; voteCount: number }> = [];
      const pollAny = msg.poll as any;
      msg.poll.answers.forEach((answer, id) => {
        const count = pollAny.results?.answerVotes?.get(id)?.count ?? 0;
        const text = answer.text ?? '';
        answers.push({ text, voteCount: count });
      });

      const winner = answers.reduce((best, a) => (a.voteCount > best.voteCount ? a : best), answers[0]);
      if (!winner) return;

      await this.postConfirmButton(poll, game, winner.text);
      this.db
        .update(schedulingPolls)
        .set({ status: 'confirming' })
        .where(eq(schedulingPolls.id, poll.id))
        .run();
    } catch (err) {
      console.warn(`[SchedulingPollService] Error checking voting poll ${poll.id}:`, err);
    }
  }

  // ── Transition to voting ──────────────────────────────────────────────────

  private async transitionToVoting(
    poll: typeof schedulingPolls.$inferSelect,
    topSlots?: PollTopSlot[]
  ): Promise<void> {
    const [game] = this.db.select().from(games).where(eq(games.id, poll.gameId)).all();
    if (!game?.discordChannelId) return;

    // Fetch top slots if not provided
    if (!topSlots) {
      const data = await this.fetchRemotePoll(poll.remotePollId);
      topSlots = data?.topSlots ?? [];
    }

    if (topSlots.length === 0) {
      console.warn(`[SchedulingPollService] Poll ${poll.id} has no top slots — skipping voting phase`);
      this.db
        .update(schedulingPolls)
        .set({ status: 'expired' })
        .where(eq(schedulingPolls.id, poll.id))
        .run();
      return;
    }

    try {
      const channel = await this.client.channels.fetch(game.discordChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const answers = topSlots.slice(0, 5).map(s => ({ text: s.label }));

      const pollMsg = await (channel as any).send({
        poll: {
          question: { text: '📅 When should we play?' },
          answers,
          duration: 24,
          allowMultiselect: false,
        },
      });

      this.db
        .update(schedulingPolls)
        .set({ status: 'voting', discordPollMessageId: pollMsg.id })
        .where(eq(schedulingPolls.id, poll.id))
        .run();

      // Update existing embed to show "voting in progress"
      if (poll.discordEmbedMessageId) {
        try {
          const embedMsg = await channel.messages.fetch(poll.discordEmbedMessageId);
          const updated = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle(`🗳️  Vote in progress — ${game.title}`)
            .setDescription('Availability collection is closed. Check the poll below to vote for the best time!');
          await embedMsg.edit({ embeds: [updated] });
        } catch {
          // ignore
        }
      }

      console.log(`[SchedulingPollService] Poll ${poll.id} transitioned to voting`);
    } catch (err) {
      console.warn(`[SchedulingPollService] Failed to post voting poll for ${poll.id}:`, err);
    }
  }

  // ── Post confirm button ───────────────────────────────────────────────────

  private async postConfirmButton(
    poll: typeof schedulingPolls.$inferSelect,
    game: typeof games.$inferSelect,
    winningLabel: string
  ): Promise<void> {
    if (!game.discordChannelId) return;

    try {
      const channel = await this.client.channels.fetch(game.discordChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm:schedule:${poll.id}:${winningLabel}`)
          .setLabel('✅  Schedule this session')
          .setStyle(ButtonStyle.Success)
      );

      await channel.send({
        content: `🗳️ The poll is closed! **${winningLabel}** won.\nFounders — click below to schedule the session.`,
        components: [row],
      });
    } catch (err) {
      console.warn(`[SchedulingPollService] Failed to post confirm button for poll ${poll.id}:`, err);
    }
  }

  // ── Confirm and schedule ──────────────────────────────────────────────────

  async confirmAndSchedule(
    localPollId: number,
    winningLabel: string,
    actorUserId: string
  ): Promise<void> {
    const [poll] = this.db
      .select()
      .from(schedulingPolls)
      .where(eq(schedulingPolls.id, localPollId))
      .all();
    if (!poll) throw new Error('Poll not found');

    const data = await this.fetchRemotePoll(poll.remotePollId);
    const winningSlot = data?.topSlots.find(s => s.label === winningLabel);

    if (!winningSlot) {
      // Fallback: parse label as best effort — still create session with placeholder
      throw new Error(`Could not match winning label "${winningLabel}" to a slot`);
    }

    // Parse startAt from "YYYY-MM-DDTHH:MM" in poll's timezone
    const startAt = DateTime.fromISO(`${winningSlot.startAt}:00`, { zone: data!.timezone }).toJSDate();
    const durationMinutes = winningSlot.endAt
      ? Math.round((new Date(`${winningSlot.endAt}:00`).getTime() - new Date(`${winningSlot.startAt}:00`).getTime()) / 60000)
      : undefined;

    const sessionService = new SessionService(this.db);
    const session = sessionService.createSession(
      {
        gameId: poll.gameId,
        startAt,
        durationMinutes,
        timezone: data!.timezone,
      },
      actorUserId,
      this.config
    );

    // Post announcement and render schedules
    const scheduleService = new ScheduleService(this.db, this.client, this.config);
    const [game] = this.db.select().from(games).where(eq(games.id, poll.gameId)).all();
    if (game) {
      scheduleService.postSessionAnnouncement(session, game).catch(console.error);
      scheduleService.renderGameSchedule(poll.gameId).catch(console.error);
    }
    scheduleService.renderSchedule().catch(console.error);

    // Mark completed and cleanup
    this.db
      .update(schedulingPolls)
      .set({ status: 'completed', scheduledSessionId: session.id })
      .where(eq(schedulingPolls.id, localPollId))
      .run();

    await this.cleanupRemotePoll(poll.remotePollId);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  async cleanupPoll(localPollId: number): Promise<void> {
    const [poll] = this.db
      .select()
      .from(schedulingPolls)
      .where(eq(schedulingPolls.id, localPollId))
      .all();
    if (!poll) return;

    await this.cleanupRemotePoll(poll.remotePollId);
    this.db
      .update(schedulingPolls)
      .set({ status: 'expired' })
      .where(eq(schedulingPolls.id, localPollId))
      .run();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private async fetchRemotePoll(remotePollId: string): Promise<{
    status: string;
    allMembersVoted: boolean;
    voterCount: number;
    totalMembers: number;
    topSlots: PollTopSlot[];
    timezone: string;
  } | null> {
    const url = process.env.STREAMING_RAINBOW_URL;
    const key = process.env.STREAMING_RAINBOW_API_KEY;
    if (!url || !key) return null;

    try {
      const res = await fetch(`${url}/api/internal/polls/${remotePollId}`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  private async callPollEnd(remotePollId: string): Promise<void> {
    const url = process.env.STREAMING_RAINBOW_URL;
    const key = process.env.STREAMING_RAINBOW_API_KEY;
    if (!url || !key) return;

    try {
      await fetch(`${url}/api/internal/polls/${remotePollId}/end`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
      });
    } catch {
      // non-fatal
    }
  }

  private async cleanupRemotePoll(remotePollId: string): Promise<void> {
    const url = process.env.STREAMING_RAINBOW_URL;
    const key = process.env.STREAMING_RAINBOW_API_KEY;
    if (!url || !key) return;

    try {
      await fetch(`${url}/api/internal/polls/${remotePollId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${key}` },
      });
    } catch {
      // non-fatal
    }
  }

  private async updateCollectingEmbed(
    game: typeof games.$inferSelect,
    poll: typeof schedulingPolls.$inferSelect,
    topSlots: PollTopSlot[],
    voterCount: number,
    totalMembers: number
  ): Promise<void> {
    if (!game.discordChannelId || !poll.discordEmbedMessageId) return;

    try {
      const channel = await this.client.channels.fetch(game.discordChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const pollUrl = `${process.env.STREAMING_RAINBOW_URL}/poll/${poll.remotePollId}`;
      const embed = buildCollectingEmbed(
        game.title,
        pollUrl,
        voterCount,
        totalMembers,
        topSlots,
        poll.expiresAt
      );

      const msg = await channel.messages.fetch(poll.discordEmbedMessageId);
      await msg.edit({ embeds: [embed] });
    } catch (err) {
      console.warn(`[SchedulingPollService] Failed to update embed for poll ${poll.id}:`, err);
    }
  }

  // ── Public helpers for commands ───────────────────────────────────────────

  getActivePollForGame(gameId: number): typeof schedulingPolls.$inferSelect | null {
    const [poll] = this.db
      .select()
      .from(schedulingPolls)
      .where(and(eq(schedulingPolls.gameId, gameId), eq(schedulingPolls.status, 'collecting')))
      .all();
    return poll ?? null;
  }

  async postInitialEmbed(
    localPollId: number,
    game: typeof games.$inferSelect,
    totalMembers: number
  ): Promise<string | null> {
    if (!game.discordChannelId) return null;

    const [poll] = this.db
      .select()
      .from(schedulingPolls)
      .where(eq(schedulingPolls.id, localPollId))
      .all();
    if (!poll) return null;

    try {
      const channel = await this.client.channels.fetch(game.discordChannelId);
      if (!channel || !(channel instanceof TextChannel)) return null;

      const pollUrl = `${process.env.STREAMING_RAINBOW_URL}/poll/${poll.remotePollId}`;
      const embed = buildCollectingEmbed(game.title, pollUrl, 0, totalMembers, [], poll.expiresAt);
      const msg = await channel.send({ embeds: [embed] });

      this.db
        .update(schedulingPolls)
        .set({ discordEmbedMessageId: msg.id })
        .where(eq(schedulingPolls.id, localPollId))
        .run();

      return msg.id;
    } catch (err) {
      console.warn(`[SchedulingPollService] Failed to post initial embed:`, err);
      return null;
    }
  }

  // Called from MessagePollVoteAdd event — uses the in-memory answer so vote counts
  // are already up to date without needing to re-fetch the message.
  async handlePollVote(answer: { poll: { messageId: string; answers: Map<number, { text?: string; voteCount: number }> } }): Promise<void> {
    const messageId = answer.poll?.messageId;
    if (!messageId) return;

    const [poll] = this.db
      .select()
      .from(schedulingPolls)
      .where(and(eq(schedulingPolls.discordPollMessageId, messageId), eq(schedulingPolls.status, 'voting')))
      .all();
    if (!poll) return;

    // Use the voter count from the availability phase (people who actually engaged
    // with scheduling) rather than total game members, so the GM not voting doesn't
    // block the trigger.
    const remoteData = await this.fetchRemotePoll(poll.remotePollId);
    const expectedVoters = remoteData?.voterCount ?? new MembershipService(this.db).getMemberCount(poll.gameId);

    // Sum vote counts directly from the in-memory poll (already updated by discord.js)
    let totalVotes = 0;
    const answers: Array<{ text: string; voteCount: number }> = [];
    answer.poll.answers.forEach((a) => {
      totalVotes += a.voteCount;
      answers.push({ text: a.text ?? '', voteCount: a.voteCount });
    });

    if (totalVotes < expectedVoters) return;

    const [game] = this.db.select().from(games).where(eq(games.id, poll.gameId)).all();
    if (!game) return;

    const winner = answers.reduce((best, a) => (a.voteCount > best.voteCount ? a : best), answers[0]);
    if (!winner?.text) return;

    await this.postConfirmButton(poll, game, winner.text);
    this.db
      .update(schedulingPolls)
      .set({ status: 'confirming' })
      .where(eq(schedulingPolls.id, poll.id))
      .run();
  }
}
