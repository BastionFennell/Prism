import { Client, TextChannel, EmbedBuilder, Colors, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { eq, and } from 'drizzle-orm';
import { DB } from '../db';
import { meetingPolls, meetings } from '../db/schema';
import { AppConfig, loadConfig } from '../config';
import { MeetingService } from './MeetingService';
import { ScheduleService } from './ScheduleService';
import { DateTime } from 'luxon';
import * as crypto from 'crypto';

const POLL_INTERVAL_MS = 5 * 60 * 1000;

export interface PollTopSlot {
  startAt: string;
  endAt: string;
  availableCount: number;
  totalMembers: number;
  label: string;
}

export interface CreateMeetingPollParams {
  title: string;
  guildId: string;
  memberDiscordIds: string[];
  dateRangeStart: string;
  dateRangeEnd: string;
  meetingDurationMinutes: number;
  dailyWindowStart: string;
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
  title: string,
  pollUrl: string,
  voterCount: number,
  totalMembers: number,
  topSlots: PollTopSlot[],
  expiresAt: number
): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(Colors.DarkGreen)
    .setTitle(`📅  Schedule a meeting — ${title}`)
    .setDescription(`🔗  [Vote on your availability](${pollUrl})\n\nFounders voted: **${voterCount} / ${totalMembers}**`)
    .setFooter({ text: `Poll closes ${new Date(expiresAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} · /meeting schedule-end to close early` });

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

export class MeetingPollService {
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
    console.log('[MeetingPollService] Started polling every 5 minutes.');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  // ── Create poll ───────────────────────────────────────────────────────────

  async createPoll(params: CreateMeetingPollParams): Promise<string> {
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
        gameId: -1,
        gameName: params.title,
        memberDiscordIds: params.memberDiscordIds,
        dateRangeStart: params.dateRangeStart,
        dateRangeEnd: params.dateRangeEnd,
        sessionDurationMinutes: params.meetingDurationMinutes,
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
      .from(meetingPolls)
      .where(eq(meetingPolls.id, localPollId))
      .all();
    if (!poll || poll.status !== 'collecting') return;

    await this.callPollEnd(poll.remotePollId);
    await this.transitionToVoting(poll);
  }

  // ── Main polling loop ─────────────────────────────────────────────────────

  private async checkPollUpdates(): Promise<void> {
    const collectingPolls = this.db
      .select()
      .from(meetingPolls)
      .where(eq(meetingPolls.status, 'collecting'))
      .all();

    for (const poll of collectingPolls) {
      await this.checkCollectingPoll(poll).catch(err => {
        console.warn(`[MeetingPollService] Error checking poll ${poll.id}:`, err);
      });
    }

    const votingPolls = this.db
      .select()
      .from(meetingPolls)
      .where(eq(meetingPolls.status, 'voting'))
      .all();

    for (const poll of votingPolls) {
      await this.checkVotingPoll(poll).catch(err => {
        console.warn(`[MeetingPollService] Error checking voting poll ${poll.id}:`, err);
      });
    }
  }

  private async checkCollectingPoll(
    poll: typeof meetingPolls.$inferSelect
  ): Promise<void> {
    const config = loadConfig();
    if (!config.meetingChannelId) return;

    const data = await this.fetchRemotePoll(poll.remotePollId);
    if (!data) return;

    const newHash = hashTopSlots(data.topSlots);
    if (newHash !== poll.lastTopSlotsHash && poll.discordEmbedMessageId) {
      await this.updateCollectingEmbed(
        poll,
        data.topSlots,
        data.voterCount,
        data.totalMembers
      );
      this.db
        .update(meetingPolls)
        .set({ lastTopSlotsHash: newHash })
        .where(eq(meetingPolls.id, poll.id))
        .run();
    }

    const expired = Date.now() >= poll.expiresAt;
    if (data.allMembersVoted || expired) {
      console.log(`[MeetingPollService] Poll ${poll.id} ready for voting (allVoted=${data.allMembersVoted}, expired=${expired})`);
      await this.callPollEnd(poll.remotePollId);
      await this.transitionToVoting(poll, data.topSlots, data.timezone);
    }
  }

  private async checkVotingPoll(
    poll: typeof meetingPolls.$inferSelect
  ): Promise<void> {
    if (!poll.discordPollMessageId) return;

    const config = loadConfig();
    if (!config.meetingChannelId) return;

    try {
      const channel = await this.client.channels.fetch(config.meetingChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const msg = await channel.messages.fetch(poll.discordPollMessageId);
      if (!msg.poll) return;

      const isFinalized = (msg.poll as any).resultsFinalized ?? false;
      if (!isFinalized) return;

      const answers: Array<{ text: string; voteCount: number }> = [];
      const pollAny = msg.poll as any;
      msg.poll.answers.forEach((answer, id) => {
        const count = pollAny.results?.answerVotes?.get(id)?.count ?? 0;
        const text = answer.text ?? '';
        answers.push({ text, voteCount: count });
      });

      const winner = answers.reduce((best, a) => (a.voteCount > best.voteCount ? a : best), answers[0]);
      if (!winner) return;

      await this.postConfirmButton(poll, winner.text);
      this.db
        .update(meetingPolls)
        .set({ status: 'confirming' })
        .where(eq(meetingPolls.id, poll.id))
        .run();
    } catch (err) {
      console.warn(`[MeetingPollService] Error checking voting poll ${poll.id}:`, err);
    }
  }

  // ── Transition to voting ──────────────────────────────────────────────────

  private async transitionToVoting(
    poll: typeof meetingPolls.$inferSelect,
    topSlots?: PollTopSlot[],
    timezone?: string
  ): Promise<void> {
    const config = loadConfig();
    if (!config.meetingChannelId) return;

    if (!topSlots || !timezone) {
      const data = await this.fetchRemotePoll(poll.remotePollId);
      topSlots = topSlots ?? data?.topSlots ?? [];
      timezone = timezone ?? data?.timezone;
    }

    if (topSlots.length === 0) {
      console.warn(`[MeetingPollService] Poll ${poll.id} has no top slots — skipping voting phase`);
      this.db
        .update(meetingPolls)
        .set({ status: 'expired' })
        .where(eq(meetingPolls.id, poll.id))
        .run();
      return;
    }

    try {
      const channel = await this.client.channels.fetch(config.meetingChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const answers = topSlots.slice(0, 5).map(s => ({ text: s.label }));

      const tzAbbr = timezone
        ? (new Intl.DateTimeFormat('en-US', { timeZone: timezone, timeZoneName: 'short' })
            .formatToParts(new Date())
            .find(p => p.type === 'timeZoneName')?.value ?? timezone)
        : '';

      const questionText = tzAbbr
        ? `📅 When should we meet? (${tzAbbr})`
        : '📅 When should we meet?';

      const pollMsg = await (channel as any).send({
        poll: {
          question: { text: questionText },
          answers,
          duration: 24,
          allowMultiselect: false,
        },
      });

      this.db
        .update(meetingPolls)
        .set({ status: 'voting', discordPollMessageId: pollMsg.id })
        .where(eq(meetingPolls.id, poll.id))
        .run();

      if (poll.discordEmbedMessageId) {
        try {
          const embedMsg = await channel.messages.fetch(poll.discordEmbedMessageId);
          const updated = new EmbedBuilder()
            .setColor(Colors.Gold)
            .setTitle('🗳️  Vote in progress — Meeting')
            .setDescription('Availability collection is closed. Check the poll below to vote for the best time!');
          await embedMsg.edit({ embeds: [updated] });
        } catch {
          // ignore
        }
      }

      console.log(`[MeetingPollService] Poll ${poll.id} transitioned to voting`);
    } catch (err) {
      console.warn(`[MeetingPollService] Failed to post voting poll for ${poll.id}:`, err);
    }
  }

  // ── Post confirm button ───────────────────────────────────────────────────

  private async postConfirmButton(
    poll: typeof meetingPolls.$inferSelect,
    winningLabel: string
  ): Promise<void> {
    const config = loadConfig();
    if (!config.meetingChannelId) return;

    try {
      const channel = await this.client.channels.fetch(config.meetingChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm:meeting-schedule:${poll.id}:${winningLabel}`)
          .setLabel('✅  Schedule this meeting')
          .setStyle(ButtonStyle.Success)
      );

      await channel.send({
        content: `🗳️ The poll is closed! **${winningLabel}** won.\nFounders — click below to schedule the meeting.`,
        components: [row],
      });
    } catch (err) {
      console.warn(`[MeetingPollService] Failed to post confirm button for poll ${poll.id}:`, err);
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
      .from(meetingPolls)
      .where(eq(meetingPolls.id, localPollId))
      .all();
    if (!poll) throw new Error('Poll not found');

    const data = await this.fetchRemotePoll(poll.remotePollId);
    const winningSlot = data?.topSlots.find(s => s.label === winningLabel);

    if (!winningSlot) {
      throw new Error(`Could not match winning label "${winningLabel}" to a slot`);
    }

    const startAt = DateTime.fromISO(`${winningSlot.startAt}:00`, { zone: data!.timezone }).toJSDate();
    const durationMinutes = winningSlot.endAt
      ? Math.round((new Date(`${winningSlot.endAt}:00`).getTime() - new Date(`${winningSlot.startAt}:00`).getTime()) / 60000)
      : undefined;

    const meetingService = new MeetingService(this.db);
    const meeting = meetingService.createMeeting(
      {
        title: 'Founder Team Meeting',
        startAt,
        durationMinutes,
        timezone: data!.timezone,
      },
      actorUserId
    );

    const config = loadConfig();
    const scheduleService = new ScheduleService(this.db, this.client, config);
    scheduleService.postMeetingAnnouncement(meeting).catch(console.error);
    scheduleService.renderSchedule().catch(console.error);

    this.db
      .update(meetingPolls)
      .set({ status: 'completed', scheduledMeetingId: meeting.id })
      .where(eq(meetingPolls.id, localPollId))
      .run();

    await this.cleanupRemotePoll(poll.remotePollId);
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  async cleanupPoll(localPollId: number): Promise<void> {
    const [poll] = this.db
      .select()
      .from(meetingPolls)
      .where(eq(meetingPolls.id, localPollId))
      .all();
    if (!poll) return;

    await this.cleanupRemotePoll(poll.remotePollId);
    this.db
      .update(meetingPolls)
      .set({ status: 'expired' })
      .where(eq(meetingPolls.id, localPollId))
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
    poll: typeof meetingPolls.$inferSelect,
    topSlots: PollTopSlot[],
    voterCount: number,
    totalMembers: number
  ): Promise<void> {
    const config = loadConfig();
    if (!config.meetingChannelId || !poll.discordEmbedMessageId) return;

    try {
      const channel = await this.client.channels.fetch(config.meetingChannelId);
      if (!channel || !(channel instanceof TextChannel)) return;

      const pollUrl = `${process.env.STREAMING_RAINBOW_URL}/poll/${poll.remotePollId}`;
      const embed = buildCollectingEmbed(
        'Founder Team Meeting',
        pollUrl,
        voterCount,
        totalMembers,
        topSlots,
        poll.expiresAt
      );

      const msg = await channel.messages.fetch(poll.discordEmbedMessageId);
      await msg.edit({ embeds: [embed] });
    } catch (err) {
      console.warn(`[MeetingPollService] Failed to update embed for poll ${poll.id}:`, err);
    }
  }

  // ── Public helpers for commands ───────────────────────────────────────────

  getActivePoll(): typeof meetingPolls.$inferSelect | null {
    const [poll] = this.db
      .select()
      .from(meetingPolls)
      .where(eq(meetingPolls.status, 'collecting'))
      .all();
    return poll ?? null;
  }

  async postInitialEmbed(
    localPollId: number,
    title: string,
    totalMembers: number
  ): Promise<string | null> {
    const config = loadConfig();
    if (!config.meetingChannelId) return null;

    const [poll] = this.db
      .select()
      .from(meetingPolls)
      .where(eq(meetingPolls.id, localPollId))
      .all();
    if (!poll) return null;

    try {
      const channel = await this.client.channels.fetch(config.meetingChannelId);
      if (!channel || !(channel instanceof TextChannel)) return null;

      const pollUrl = `${process.env.STREAMING_RAINBOW_URL}/poll/${poll.remotePollId}`;
      const embed = buildCollectingEmbed(title, pollUrl, 0, totalMembers, [], poll.expiresAt);
      const msg = await channel.send({ embeds: [embed] });

      this.db
        .update(meetingPolls)
        .set({ discordEmbedMessageId: msg.id })
        .where(eq(meetingPolls.id, localPollId))
        .run();

      return msg.id;
    } catch (err) {
      console.warn(`[MeetingPollService] Failed to post initial embed:`, err);
      return null;
    }
  }

  async handlePollVote(answer: { poll: { messageId: string; answers: Map<number, { text?: string; voteCount: number }> } }): Promise<void> {
    const messageId = answer.poll?.messageId;
    if (!messageId) return;

    const [poll] = this.db
      .select()
      .from(meetingPolls)
      .where(and(eq(meetingPolls.discordPollMessageId, messageId), eq(meetingPolls.status, 'voting')))
      .all();
    if (!poll) return;

    const remoteData = await this.fetchRemotePoll(poll.remotePollId);
    const expectedVoters = remoteData?.voterCount ?? 0;

    let totalVotes = 0;
    const answers: Array<{ text: string; voteCount: number }> = [];
    answer.poll.answers.forEach((a) => {
      totalVotes += a.voteCount;
      answers.push({ text: a.text ?? '', voteCount: a.voteCount });
    });

    if (totalVotes < expectedVoters) return;

    const winner = answers.reduce((best, a) => (a.voteCount > best.voteCount ? a : best), answers[0]);
    if (!winner?.text) return;

    await this.postConfirmButton(poll, winner.text);
    this.db
      .update(meetingPolls)
      .set({ status: 'confirming' })
      .where(eq(meetingPolls.id, poll.id))
      .run();
  }
}
