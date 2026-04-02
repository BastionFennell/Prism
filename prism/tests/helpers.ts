import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import path from 'path';
import * as schema from '../src/db/schema';
import { AppConfig } from '../src/config';

export function makeTestDb() {
  const sqlite = new Database(':memory:');
  sqlite.pragma('foreign_keys = ON');
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, '../src/db/migrations') });
  return db;
}

export type TestDB = ReturnType<typeof makeTestDb>;

// Fake Discord client — services call Discord for role/thread operations;
// in unit tests we stub those out so tests stay fast and offline.
export function makeTestClient() {
  return {
    guilds: {
      fetch: async () => ({
        members: {
          fetch: async () => ({
            roles: { add: async () => {}, remove: async () => {} },
            id: 'member-id',
          }),
          cache: new Map(),
        },
        roles: {
          cache: new Map(),
        },
      }),
    },
    channels: {
      fetch: async () => ({
        threads: {
          create: async ({ name }: { name: string }) => ({ id: `thread-${name}` }),
        },
        isThread: () => false,
        messages: {
          fetch: async () => ({ edit: async () => {}, delete: async () => {} }),
        },
        send: async () => ({ id: 'msg-id' }),
      }),
    },
  } as any;
}

export const TEST_CONFIG: AppConfig = {
  token: 'test-token',
  clientId: 'test-client-id',
  guildId: '1485480269552029808',
  founderRoleId: 'founder-role-id',
  gamesChannelId: 'games-channel-id',
  scheduleChannelId: 'schedule-channel-id',
  defaultTimezone: 'UTC',
  pooledRoleIds: ['role-1', 'role-2', 'role-3'],
};

// Test bot IDs (same as application IDs)
export const TEST_BOT_1_ID = '1485496513009287328';
export const TEST_BOT_2_ID = '1485497551540064367';
export const FOUNDER_USER_ID = 'founder-user';
