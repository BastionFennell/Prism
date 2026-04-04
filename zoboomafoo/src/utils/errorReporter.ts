import { Client, TextChannel, NewsChannel, EmbedBuilder } from 'discord.js';
import { loadConfig } from '../config';

const DEDUP_WINDOW_MS = 60_000;
const MAX_DESCRIPTION_LENGTH = 4000;

let discordClient: Client | null = null;
const recentMessages = new Map<string, number>();

const originalError = console.error.bind(console);
const originalWarn = console.warn.bind(console);

function formatArgs(args: unknown[]): string {
  return args
    .map((a) => (a instanceof Error ? a.stack ?? a.message : typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ');
}

function extractPrefix(message: string): string | null {
  const match = message.match(/^\[([^\]]+)\]/);
  return match ? match[1] : null;
}

function isDuplicate(key: string): boolean {
  const now = Date.now();
  const last = recentMessages.get(key);
  if (last && now - last < DEDUP_WINDOW_MS) return true;
  recentMessages.set(key, now);

  // Clean old entries periodically
  if (recentMessages.size > 100) {
    for (const [k, t] of recentMessages) {
      if (now - t > DEDUP_WINDOW_MS) recentMessages.delete(k);
    }
  }

  return false;
}

async function reportToDiscord(level: 'error' | 'warn', args: unknown[]): Promise<void> {
  if (!discordClient?.isReady()) return;

  const config = loadConfig();
  if (!config.errorChannelId) return;

  const message = formatArgs(args);
  if (isDuplicate(`${level}:${message}`)) return;

  const prefix = extractPrefix(message);
  const title = prefix ? `${level === 'error' ? 'Error' : 'Warning'} in ${prefix}` : (level === 'error' ? 'Error' : 'Warning');
  const description = message.length > MAX_DESCRIPTION_LENGTH
    ? message.slice(0, MAX_DESCRIPTION_LENGTH - 3) + '...'
    : message;

  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(`\`\`\`\n${description}\n\`\`\``)
    .setColor(level === 'error' ? 0xED4245 : 0xFEE75C)
    .setTimestamp();

  try {
    const channel = await discordClient.channels.fetch(config.errorChannelId);
    if (channel instanceof TextChannel || channel instanceof NewsChannel) {
      await channel.send({ embeds: [embed] });
    }
  } catch {
    // Never re-trigger the reporter — just log to original console
    originalWarn('[ErrorReporter] Failed to send error report to Discord.');
  }
}

export function initErrorReporter(client: Client): void {
  discordClient = client;

  console.error = (...args: unknown[]) => {
    originalError(...args);
    reportToDiscord('error', args).catch(() => {});
  };

  console.warn = (...args: unknown[]) => {
    originalWarn(...args);
    reportToDiscord('warn', args).catch(() => {});
  };

  originalWarn('[ErrorReporter] Initialized — errors and warnings will be reported to Discord.');
}
