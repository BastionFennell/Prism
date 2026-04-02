import { db } from './db';
import { botConfig } from './db/schema';

export interface AppConfig {
  token: string;
  clientId: string;
  guildId: string;
  founderRoleId: string;
  gamesChannelId: string;
  scheduleChannelId: string;
  defaultTimezone: string;
  pooledRoleIds: string[];
}

let cached: AppConfig | null = null;

export function invalidateConfig(): void {
  cached = null;
}

export async function loadConfig(): Promise<AppConfig> {
  if (cached) return cached;

  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;

  if (!token) throw new Error('DISCORD_TOKEN is not set in environment');
  if (!clientId) throw new Error('DISCORD_CLIENT_ID is not set in environment');

  const row = db.select().from(botConfig).limit(1).all()[0];

  if (!row) {
    // Return a partial config — the bot will start but guild-dependent
    // commands will fail with a "not configured" message.
    return {
      token,
      clientId,
      guildId: '',
      founderRoleId: '',
      gamesChannelId: '',
      scheduleChannelId: '',
      defaultTimezone: 'UTC',
      pooledRoleIds: [],
    };
  }

  cached = {
    token,
    clientId,
    guildId: row.guildId,
    founderRoleId: row.founderRoleId,
    gamesChannelId: row.gamesChannelId,
    scheduleChannelId: row.scheduleChannelId,
    defaultTimezone: row.defaultTimezone,
    pooledRoleIds: JSON.parse(row.pooledRoleIds) as string[],
  };

  return cached;
}

export function requireConfig(config: AppConfig): void {
  if (!config.guildId) {
    throw new Error(
      'Bot is not configured. Run /admin setup to configure guild settings.'
    );
  }
}
