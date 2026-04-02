import { describe, it, expect, beforeEach } from 'vitest';
import { GameService } from '../../src/services/GameService';
import { makeTestDb, makeTestClient, TEST_CONFIG, FOUNDER_USER_ID, TestDB } from '../helpers';

let db: TestDB;
let service: GameService;

beforeEach(() => {
  db = makeTestDb();
  service = new GameService(db, makeTestClient());
});

describe('createGame', () => {
  it('creates a game and returns it', async () => {
    const game = await service.createGame(
      { title: 'Test Game', gmUserId: FOUNDER_USER_ID, systemName: 'D&D 5e' },
      FOUNDER_USER_ID,
      TEST_CONFIG
    );
    expect(game.title).toBe('Test Game');
    expect(game.systemName).toBe('D&D 5e');
    expect(game.status).toBe('recruiting');
    expect(game.discordRoleId).toBe('role-1');
  });

  it('assigns the GM as first member', async () => {
    const game = await service.createGame(
      { title: 'Test Game', gmUserId: FOUNDER_USER_ID },
      FOUNDER_USER_ID,
      TEST_CONFIG
    );
    expect(service.getMemberCount(game.id)).toBe(1);
  });

  it('assigns roles from the pool in order', async () => {
    const g1 = await service.createGame({ title: 'Game 1', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    const g2 = await service.createGame({ title: 'Game 2', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    const g3 = await service.createGame({ title: 'Game 3', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    expect(g1.discordRoleId).toBe('role-1');
    expect(g2.discordRoleId).toBe('role-2');
    expect(g3.discordRoleId).toBe('role-3');
  });

  it('throws when no pooled roles are available', async () => {
    await service.createGame({ title: 'Game 1', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await service.createGame({ title: 'Game 2', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await service.createGame({ title: 'Game 3', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await expect(
      service.createGame({ title: 'Game 4', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG)
    ).rejects.toThrow('No pooled roles are available');
  });

  it('throws on duplicate title', async () => {
    await service.createGame({ title: 'Dupe', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await expect(
      service.createGame({ title: 'Dupe', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG)
    ).rejects.toThrow('already exists');
  });

  it('creates with active status when specified', async () => {
    const game = await service.createGame(
      { title: 'Active Game', gmUserId: FOUNDER_USER_ID, status: 'active' },
      FOUNDER_USER_ID,
      TEST_CONFIG
    );
    expect(game.status).toBe('active');
  });
});

describe('getGame', () => {
  it('returns a game by ID', async () => {
    const created = await service.createGame({ title: 'Lookup Me', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    const found = service.getGame(created.id);
    expect(found.title).toBe('Lookup Me');
  });

  it('throws for unknown ID', () => {
    expect(() => service.getGame(99999)).toThrow('not found');
  });
});

describe('findGamesByTitle', () => {
  it('finds games by partial title match', async () => {
    await service.createGame({ title: 'Curse of Strahd', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await service.createGame({ title: 'Pathfinder Crew', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    const results = service.findGamesByTitle('curse');
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Curse of Strahd');
  });

  it('returns empty array for no match', async () => {
    await service.createGame({ title: 'Something', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    expect(service.findGamesByTitle('zzz')).toHaveLength(0);
  });
});

describe('setStatus', () => {
  it('pauses an active game', async () => {
    const game = await service.createGame({ title: 'Game', gmUserId: FOUNDER_USER_ID, status: 'active' }, FOUNDER_USER_ID, TEST_CONFIG);
    const updated = await service.setStatus(game.id, 'paused', FOUNDER_USER_ID, TEST_CONFIG);
    expect(updated.status).toBe('paused');
  });

  it('resumes a paused game', async () => {
    const game = await service.createGame({ title: 'Game', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await service.setStatus(game.id, 'paused', FOUNDER_USER_ID, TEST_CONFIG);
    const resumed = await service.setStatus(game.id, 'active', FOUNDER_USER_ID, TEST_CONFIG);
    expect(resumed.status).toBe('active');
  });

  it('sets archivedAt when archiving', async () => {
    const game = await service.createGame({ title: 'Game', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    const archived = await service.setStatus(game.id, 'archived', FOUNDER_USER_ID, TEST_CONFIG);
    expect(archived.archivedAt).toBeInstanceOf(Date);
  });

  it('throws on invalid transition (cleared → anything)', async () => {
    const game = await service.createGame({ title: 'Game', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await service.setStatus(game.id, 'cleared', FOUNDER_USER_ID, TEST_CONFIG);
    await expect(
      service.setStatus(game.id, 'active', FOUNDER_USER_ID, TEST_CONFIG)
    ).rejects.toThrow('Cannot transition');
  });

  it('frees the pooled role after archiving', async () => {
    // Fill all 3 slots
    const g1 = await service.createGame({ title: 'G1', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await service.createGame({ title: 'G2', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await service.createGame({ title: 'G3', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);

    // Pool is now exhausted — archive G1 to free role-1
    await service.setStatus(g1.id, 'archived', FOUNDER_USER_ID, TEST_CONFIG);

    // Should now succeed
    const g4 = await service.createGame({ title: 'G4', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    expect(g4.discordRoleId).toBe('role-1');
  });
});

describe('listGames', () => {
  it('excludes archived games by default', async () => {
    const g1 = await service.createGame({ title: 'Active', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    const g2 = await service.createGame({ title: 'ToArchive', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await service.setStatus(g2.id, 'archived', FOUNDER_USER_ID, TEST_CONFIG);

    const games = service.listGames(false);
    expect(games.map((g) => g.id)).toContain(g1.id);
    expect(games.map((g) => g.id)).not.toContain(g2.id);
  });

  it('includes archived games when requested', async () => {
    const g1 = await service.createGame({ title: 'Active', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    const g2 = await service.createGame({ title: 'Archived', gmUserId: FOUNDER_USER_ID }, FOUNDER_USER_ID, TEST_CONFIG);
    await service.setStatus(g2.id, 'archived', FOUNDER_USER_ID, TEST_CONFIG);

    const games = service.listGames(true);
    expect(games).toHaveLength(2);
  });
});
