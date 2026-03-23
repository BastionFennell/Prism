import { describe, it, expect, beforeEach } from 'vitest';
import { GameService } from '../../src/services/GameService';
import { MembershipService } from '../../src/services/MembershipService';
import { makeTestDb, makeTestClient, TEST_CONFIG, FOUNDER_USER_ID, TEST_BOT_1_ID, TEST_BOT_2_ID, TestDB } from '../helpers';

let db: TestDB;
let gameService: GameService;
let membershipService: MembershipService;

beforeEach(() => {
  db = makeTestDb();
  const client = makeTestClient();
  gameService = new GameService(db, client);
  membershipService = new MembershipService(db, client);
});

async function createGame(title = 'Test Game', playerCap?: number) {
  return gameService.createGame(
    { title, gmUserId: FOUNDER_USER_ID, playerCap },
    FOUNDER_USER_ID,
    TEST_CONFIG
  );
}

describe('joinGame', () => {
  it('adds a member to the game', async () => {
    const game = await createGame();
    await membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG);
    expect(gameService.getMemberCount(game.id)).toBe(2); // GM + bot 1
  });

  it('throws on duplicate join', async () => {
    const game = await createGame();
    await membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG);
    await expect(
      membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG)
    ).rejects.toThrow('already a member');
  });

  it('respects player cap (GM does not count)', async () => {
    // cap=1: one player slot; GM is auto-added but excluded from cap count
    const game = await createGame('Capped Game', 1);
    await membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG); // fills the slot
    await expect(
      membershipService.joinGame(game.id, TEST_BOT_2_ID, TEST_BOT_2_ID, TEST_CONFIG)
    ).rejects.toThrow('full');
  });

  it('allows joining up to but not exceeding the cap', async () => {
    // cap=1: BOT_1_ID fills the slot, BOT_2_ID is blocked
    const game = await createGame('Capped Game', 1);
    await membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG);
    expect(gameService.getMemberCount(game.id)).toBe(2); // GM + 1 player
    await expect(
      membershipService.joinGame(game.id, TEST_BOT_2_ID, TEST_BOT_2_ID, TEST_CONFIG)
    ).rejects.toThrow('full');
  });

  it('throws when joining an archived game', async () => {
    const game = await createGame();
    await gameService.setStatus(game.id, 'archived', FOUNDER_USER_ID, TEST_CONFIG);
    await expect(
      membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG)
    ).rejects.toThrow('no longer active');
  });

  it('allows re-joining after leaving', async () => {
    const game = await createGame();
    await membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG);
    await membershipService.leaveGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG);
    await membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG);
    expect(gameService.getMemberCount(game.id)).toBe(2);
  });
});

describe('leaveGame', () => {
  it('removes a member from the game', async () => {
    const game = await createGame();
    await membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG);
    await membershipService.leaveGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG);
    expect(gameService.getMemberCount(game.id)).toBe(1); // Only GM remains
  });

  it('throws when leaving a game you are not in', async () => {
    const game = await createGame();
    await expect(
      membershipService.leaveGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG)
    ).rejects.toThrow('not a member');
  });
});

describe('getActiveMembers', () => {
  it('returns only active members', async () => {
    const game = await createGame();
    await membershipService.joinGame(game.id, TEST_BOT_1_ID, TEST_BOT_1_ID, TEST_CONFIG);
    await membershipService.joinGame(game.id, TEST_BOT_2_ID, TEST_BOT_2_ID, TEST_CONFIG);
    await membershipService.leaveGame(game.id, TEST_BOT_2_ID, TEST_BOT_2_ID, TEST_CONFIG);

    const members = membershipService.getActiveMembers(game.id);
    expect(members).toContain(FOUNDER_USER_ID);
    expect(members).toContain(TEST_BOT_1_ID);
    expect(members).not.toContain(TEST_BOT_2_ID);
  });
});
