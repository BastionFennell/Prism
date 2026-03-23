import { Client, TextChannel } from 'discord.js';
import { eq, and, gt } from 'drizzle-orm';
import { DB } from '../db';
import { sessions, games } from '../db/schema';
import { loadConfig } from '../config';
import { discordTimestamp } from '../utils/time';

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const H24  = 24 * 60 * 60 * 1000;
const M30  = 30 * 60 * 1000;

const MESSAGES_24H = [
  (title: string, time: string, role: string) =>
    `🦎 ZABOOOO! **${title}** is happening **TOMORROW**! ${time}\nGet pumped, get ready, get your snacks!! ${role}`,
  (title: string, time: string, role: string) =>
    `📣 ONE DAY AWAY!! The **${title}** adventure starts tomorrow — ${time}!\nCharge your dice. Stretch your fingers. IT'S ALMOST TIME! ${role}`,
  (title: string, time: string, role: string) =>
    `🌟 GUESS WHAT TOMORROW IS?? **${title}** day!! ${time}\nZoboomafoo says: be there or be a boring old rock. 🪨 ${role}`,
  (title: string, time: string, role: string) =>
    `🎒 PACK YOUR BAGS, ADVENTURERS! **${title}** is tomorrow!! ${time}\nSleep well tonight — you're gonna need your energy!! 💤⚔️ ${role}`,
  (title: string, time: string, role: string) =>
    `🐾 *sniffs the air* ...do you smell that? That's the smell of **${title}** happening TOMORROW!! ${time}\nZoboomafoo has been waiting ALL WEEK for this!! ${role}`,
  (title: string, time: string, role: string) =>
    `🌙 T-MINUS 24 HOURS until **${title}**!! ${time}\nDreams of crits and epic moments tonight, yeah?? 🎲✨ ${role}`,
  (title: string, time: string, role: string) =>
    `🍃 The forest is whispering... **${title}** is TOMORROW!! ${time}\nZoboomafoo is doing his happy dance RIGHT NOW 🦎💃 ${role}`,
  (title: string, time: string, role: string) =>
    `🎺 *blows adventure horn* ATTENTION ADVENTURERS!! **${title}** is in ONE DAY!! ${time}\nGet hype. Get ready. Get in there!! ${role}`,
  (title: string, time: string, role: string) =>
    `⚡ TOMORROW!! **${title}**!! ${time}!!\nZoboomafoo has reviewed the quest notes and is VERY concerned about what's coming. Good luck!! 👀🎲 ${role}`,
  (title: string, time: string, role: string) =>
    `🌄 Rise and shine, heroes — well, tomorrow at least! **${title}** kicks off at ${time}!\nRest up. The adventure won't wait!! 🛡️✨ ${role}`,
];

const MESSAGES_30M = [
  (title: string, time: string, role: string) =>
    `🚨 THIRTY MINUTES!! THIRTY WHOLE MINUTES until **${title}**!! ${time}\nWRAP IT UP. LOG IN. LET'S GOOOOO!! 🎲🎉 ${role}`,
  (title: string, time: string, role: string) =>
    `⏰ HALF AN HOUR! The **${title}** quest begins at ${time}!\nZoboomafoo is VERY excited and so should you be!! 🦎✨ ${role}`,
  (title: string, time: string, role: string) =>
    `🎮 IT'S ALMOST TIME FOR **${title}**!! ${time} — that's 30 minutes from RIGHT NOW!\nMove your feet, find your seat, adventure awaits!! 🌿🎲 ${role}`,
  (title: string, time: string, role: string) =>
    `🔥 HALF AN HOUR TO GO!! **${title}** starts at ${time}!!\nZoboomafoo is pacing. Zoboomafoo is ready. ARE YOU READY?? 🦎🔥 ${role}`,
  (title: string, time: string, role: string) =>
    `🎯 30 MINUTES!! Put the snacks down — actually no, BRING the snacks — **${title}** is almost here!! ${time} ${role}`,
  (title: string, time: string, role: string) =>
    `🌀 THE PORTAL OPENS IN 30 MINUTES!! **${title}** — ${time}!!\nZoboomafoo has been sitting by the door for an hour. Let's GOOO!! 🚪✨ ${role}`,
  (title: string, time: string, role: string) =>
    `⚔️ HEROES! Your destiny calls!! **${title}** begins at ${time} — that's in THIRTY MINUTES!!\nZoboomafoo believes in you. Mostly. 👀 ${role}`,
  (title: string, time: string, role: string) =>
    `🐾 *leaps out of the jungle* IT'S TIME!! Almost!! 30 minutes!! **${title}**!! ${time}!!\nZoboomafoo cannot contain himself!! 🦎💥 ${role}`,
  (title: string, time: string, role: string) =>
    `🎶 *humming the adventure theme* la la la— OH WAIT IT'S IN 30 MINUTES!! **${title}**!! ${time}!! GO GO GO!! ${role}`,
  (title: string, time: string, role: string) =>
    `🧭 FINAL CALL!! **${title}** is happening in 30 minutes — ${time}!!\nGet your character sheet. Get your vibes. Get IN HERE!! 🎲🌟 ${role}`,
];

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export class ReminderService {
  private intervalId: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly db: DB,
    private readonly client: Client
  ) {}

  start(): void {
    if (this.intervalId) return;
    this.checkAndSendReminders().catch(console.error);
    this.intervalId = setInterval(() => {
      this.checkAndSendReminders().catch(console.error);
    }, POLL_INTERVAL_MS);
    console.log('[ReminderService] Started polling every 5 minutes.');
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  async checkAndSendReminders(): Promise<void> {
    const config = loadConfig();
    if (!config.guildId) return;

    const now = new Date();

    const upcoming = this.db
      .select({ session: sessions, game: games })
      .from(sessions)
      .innerJoin(games, eq(sessions.gameId, games.id))
      .where(and(eq(sessions.status, 'scheduled'), gt(sessions.startAt, now)))
      .all();

    for (const { session, game } of upcoming) {
      const msUntil = session.startAt.getTime() - now.getTime();

      if (msUntil <= M30 && !session.reminder30mSentAt) {
        await this.sendReminder(session.id, game, '30m');
      } else if (msUntil <= H24 && !session.reminder24hSentAt) {
        await this.sendReminder(session.id, game, '24h');
      }
    }
  }

  private async sendReminder(
    sessionId: number,
    game: typeof games.$inferSelect,
    timeframe: '24h' | '30m'
  ): Promise<void> {
    if (!game.discordChannelId) return;

    try {
      const channel = await this.client.channels.fetch(game.discordChannelId);
      if (!channel || !(channel instanceof TextChannel)) {
        console.warn(`[ReminderService] Channel ${game.discordChannelId} not found for game ${game.id}`);
        return;
      }

      const [fullSession] = this.db.select().from(sessions).where(eq(sessions.id, sessionId)).all();
      if (!fullSession) return;

      const role = game.discordRoleId ? `<@&${game.discordRoleId}>` : '';
      const time = `${discordTimestamp(fullSession.startAt, 'F')} (${discordTimestamp(fullSession.startAt, 'R')})`;

      const template = timeframe === '24h' ? pick(MESSAGES_24H) : pick(MESSAGES_30M);
      const content = template(game.title, time, role);

      await channel.send(content);

      const now = new Date();
      if (timeframe === '24h') {
        this.db.update(sessions).set({ reminder24hSentAt: now }).where(eq(sessions.id, sessionId)).run();
      } else {
        this.db.update(sessions).set({ reminder30mSentAt: now }).where(eq(sessions.id, sessionId)).run();
      }

      console.log(`[ReminderService] Sent ${timeframe} reminder for session ${sessionId} (${game.title})`);
    } catch (err) {
      console.warn(`[ReminderService] Failed to send reminder for session ${sessionId}:`, err);
    }
  }
}
