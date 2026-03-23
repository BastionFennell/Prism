import { describe, it, expect, beforeEach } from 'vitest';
import { GameService } from '../../src/services/GameService';
import { RolePoolService } from '../../src/services/RolePoolService';
import { makeTestDb, makeTestClient, TEST_CONFIG, FOUNDER_USER_ID, TestDB } from '../helpers';

let db: TestDB;
let gameService: GameService;
let rolePoolService: RolePoolService;

beforeEach(() => {
  db = makeTestDb();
  gameService = new GameService(db, makeTestClient());
  rolePoolService = new RolePoolService(db);
});

describe('assignNextRole', () => {
  it('returns the first available role', () => {
    const role = rolePoolService.assignNextRole(TEST_CONFIG);
    expect(role).toBe('role-1');
  });

  it('skips roles already in use', async () => {
    await gameService.createGame({ title: 'G1', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    const role = rolePoolService.assignNextRole(TEST_CONFIG);
    expect(role).toBe('role-2');
  });

  it('throws when all roles are in use', async () => {
    await gameService.createGame({ title: 'G1', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await gameService.createGame({ title: 'G2', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await gameService.createGame({ title: 'G3', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    expect(() => rolePoolService.assignNextRole(TEST_CONFIG)).toThrow('No pooled roles are available');
  });
});

describe('getPoolStatus', () => {
  it('shows all roles as available when no games exist', () => {
    const status = rolePoolService.getPoolStatus(TEST_CONFIG);
    expect(status).toHaveLength(3);
    expect(status.every((s) => s.status === 'available')).toBe(true);
  });

  it('marks used roles correctly', async () => {
    await gameService.createGame({ title: 'My Game', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    const status = rolePoolService.getPoolStatus(TEST_CONFIG);
    expect(status[0].status).toBe('in_use');
    expect(status[0].gameTitle).toBe('My Game');
    expect(status[1].status).toBe('available');
  });

  it('frees role after game is archived', async () => {
    const game = await gameService.createGame({ title: 'G', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await gameService.setStatus(game.id, 'archived', FOUNDER_USER_ID, TEST_CONFIG);
    const status = rolePoolService.getPoolStatus(TEST_CONFIG);
    expect(status.every((s) => s.status === 'available')).toBe(true);
  });
});
