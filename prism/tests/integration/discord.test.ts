/**
 * Integration tests — hit the real Discord API.
 * Does NOT require the main Prism bot to be running.
 * Main Prism bot acts as the Discord client (has Manage Roles permission).
 * Test Bot 1 and Test Bot 2 are used as member subjects.
 *
 * Run with: npm run test:integration
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import { Client, GatewayIntentBits } from 'discord.js';
import * as path from 'path';
import { makeTestDb } from '../helpers';
import { GameService } from '../../src/services/GameService';
import { MembershipService } from '../../src/services/MembershipService';
import { AppConfig } from '../../src/config';

// Load main bot token first, then test-specific vars (test vars take precedence)
dotenv.config({ path: path.join(__dirname, '../../.env') });
dotenv.config({ path: path.join(__dirname, '../../.env.test') });

const GUILD_ID      = '1485480269552029808';
const GAMES_CHANNEL = '1485480270357467229'; // #general
const PRISM_BOT_ID  = '1485048549220814878'; // main Prism bot (has Manage Roles)
const BOT_1_ID      = '1485496513009287328'; // test member subject 1 (GM)
const BOT_2_ID      = '1485497551540064367'; // test member subject 2 (player)
const PRISM_TOKEN   = process.env.DISCORD_TOKEN!;

const COMMUNITY_ROLES = [
  '1485500361187000411', // community-1
  '1485500379880755321', // community-2
  '1485500386658750566', // community-3
];

const config: AppConfig = {
  token: PRISM_TOKEN,
  clientId: PRISM_BOT_ID,
  guildId: GUILD_ID,
  founderRoleId: '',
  gamesChannelId: GAMES_CHANNEL,
  scheduleChannelId: GAMES_CHANNEL,
  defaultTimezone: 'UTC',
  pooledRoleIds: COMMUNITY_ROLES,
};

let client: Client;
let db: ReturnType<typeof makeTestDb>;
let gameService: GameService;
let membershipService: MembershipService;
let createdGameId = 0;
let capGameId = 0;

// REST client using main Prism bot token to inspect and mutate Discord state
const rest = new REST({ version: '10' }).setToken(PRISM_TOKEN);

async function getMemberRoles(userId: string): Promise<string[]> {
  const member: any = await rest.get(Routes.guildMember(GUILD_ID, userId));
  return member.roles as string[];
}

beforeAll(async () => {
  db = makeTestDb();
  client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers] });
  await client.login(PRISM_TOKEN);
  await new Promise<void>((resolve) => client.once('ready', () => resolve()));
  gameService = new GameService(db, client);
  membershipService = new MembershipService(db, client);
}, 20000);

afterAll(async () => {
  for (const id of [createdGameId, capGameId]) {
    if (id) {
      try {
        await gameService.deleteGame(id, 'test-cleanup', config);
      } catch { /* already cleaned up */ }
    }
  }
  await client?.destroy();
}, 20000);

describe('Game lifecycle', () => {
  it('creates a game, assigns community-1 role to Bot 1 (GM)', async () => {
    const game = await gameService.createGame(
      { title: `Integration Test ${Date.now()}`, gmUserId: BOT_1_ID },
      BOT_1_ID,
      config
    );
    createdGameId = game.id;

    expect(game.discordRoleId).toBe(COMMUNITY_ROLES[0]);
    expect(game.discordThreadId).toBeTruthy();

    const roles = await getMemberRoles(BOT_1_ID);
    expect(roles).toContain(COMMUNITY_ROLES[0]);
  }, 20000);

  it('Bot 2 joins — gets community-1 role in Discord', async () => {
    await membershipService.joinGame(createdGameId, BOT_2_ID, BOT_2_ID, config);
    expect(gameService.getMemberCount(createdGameId)).toBe(2);

    const roles = await getMemberRoles(BOT_2_ID);
    expect(roles).toContain(COMMUNITY_ROLES[0]);
  }, 20000);

  it('Bot 2 leaves — community-1 role removed in Discord', async () => {
    await membershipService.leaveGame(createdGameId, BOT_2_ID, BOT_2_ID, config);
    expect(gameService.getMemberCount(createdGameId)).toBe(1);

    const roles = await getMemberRoles(BOT_2_ID);
    expect(roles).not.toContain(COMMUNITY_ROLES[0]);
  }, 20000);

  it('archive — removes community-1 role from all members and archives thread', async () => {
    await gameService.setStatus(createdGameId, 'archived', BOT_1_ID, config);

    const roles = await getMemberRoles(BOT_1_ID);
    expect(roles).not.toContain(COMMUNITY_ROLES[0]);

    createdGameId = 0; // mark cleaned up
  }, 20000);
});

describe('Player cap', () => {
  it('Bot 1 joins a 1-player-cap game (GM does not count)', async () => {
    // Prism bot is GM — its slot doesn't count toward the cap
    const game = await gameService.createGame(
      { title: `Cap Test ${Date.now()}`, gmUserId: PRISM_BOT_ID, playerCap: 1 },
      PRISM_BOT_ID,
      config
    );
    capGameId = game.id;

    await membershipService.joinGame(capGameId, BOT_1_ID, BOT_1_ID, config);
    expect(gameService.getMemberCount(capGameId, game.gmUserId)).toBe(1); // 1 player, GM excluded

    const roles = await getMemberRoles(BOT_1_ID);
    expect(roles).toContain(game.discordRoleId); // whatever role was assigned to this game
  }, 20000);

  it('Bot 2 cannot join — game is full', async () => {
    await expect(
      membershipService.joinGame(capGameId, BOT_2_ID, BOT_2_ID, config)
    ).rejects.toThrow('game is full');
  }, 20000);
});
