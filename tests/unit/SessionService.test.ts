import { describe, it, expect, beforeEach } from 'vitest';
import { GameService } from '../../src/services/GameService';
import { SessionService } from '../../src/services/SessionService';
import { makeTestDb, makeTestClient, TEST_CONFIG, FOUNDER_USER_ID, TestDB } from '../helpers';

let db: TestDB;
let gameService: GameService;
let sessionService: SessionService;

beforeEach(() => {
  db = makeTestDb();
  gameService = new GameService(db, makeTestClient());
  sessionService = new SessionService(db);
});

function futureDate(daysFromNow: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d;
}

async function createGame() {
  return gameService.createGame(
    { title: 'Test Game', gmUserId: FOUNDER_USER_ID },
    FOUNDER_USER_ID,
    TEST_CONFIG
  );
}

describe('createSession', () => {
  it('creates a session for a game', async () => {
    const game = await createGame();
    const session = sessionService.createSession(
      { gameId: game.id, startAt: futureDate(7), timezone: 'UTC', title: 'Session 1' },
      FOUNDER_USER_ID,
      TEST_CONFIG
    );
    expect(session.gameId).toBe(game.id);
    expect(session.title).toBe('Session 1');
    expect(session.status).toBe('scheduled');
  });

  it('throws when adding session to archived game', async () => {
    const game = await createGame();
    await gameService.setStatus(game.id, 'archived', FOUNDER_USER_ID, TEST_CONFIG);
    expect(() =>
      sessionService.createSession(
        { gameId: game.id, startAt: futureDate(7), timezone: 'UTC' },
        FOUNDER_USER_ID,
        TEST_CONFIG
      )
    ).toThrow('archived or cleared');
  });
});

describe('getUpcomingSessions', () => {
  it('only returns scheduled future sessions', async () => {
    const game = await createGame();
    const s1 = sessionService.createSession(
      { gameId: game.id, startAt: futureDate(1), timezone: 'UTC', title: 'Soon' },
      FOUNDER_USER_ID, TEST_CONFIG
    );
    const s2 = sessionService.createSession(
      { gameId: game.id, startAt: futureDate(14), timezone: 'UTC', title: 'Later' },
      FOUNDER_USER_ID, TEST_CONFIG
    );
    sessionService.setSessionStatus(s2.id, 'canceled', FOUNDER_USER_ID);

    const upcoming = sessionService.getUpcomingSessions(game.id);
    expect(upcoming).toHaveLength(1);
    expect(upcoming[0].title).toBe('Soon');
  });

  it('returns sessions in chronological order', async () => {
    const game = await createGame();
    sessionService.createSession({ gameId: game.id, startAt: futureDate(10), timezone: 'UTC', title: 'C' }, FOUNDER_USER_ID, TEST_CONFIG);
    sessionService.createSession({ gameId: game.id, startAt: futureDate(2), timezone: 'UTC', title: 'A' }, FOUNDER_USER_ID, TEST_CONFIG);
    sessionService.createSession({ gameId: game.id, startAt: futureDate(5), timezone: 'UTC', title: 'B' }, FOUNDER_USER_ID, TEST_CONFIG);

    const upcoming = sessionService.getUpcomingSessions(game.id);
    expect(upcoming.map((s) => s.title)).toEqual(['A', 'B', 'C']);
  });
});

describe('updateSession', () => {
  it('updates title and notes', async () => {
    const game = await createGame();
    const session = sessionService.createSession(
      { gameId: game.id, startAt: futureDate(7), timezone: 'UTC', title: 'Old Title' },
      FOUNDER_USER_ID, TEST_CONFIG
    );
    const updated = sessionService.updateSession(session.id, { title: 'New Title', notes: 'Some notes' }, FOUNDER_USER_ID);
    expect(updated.title).toBe('New Title');
    expect(updated.notes).toBe('Some notes');
  });

  it('throws when editing a canceled session', async () => {
    const game = await createGame();
    const session = sessionService.createSession(
      { gameId: game.id, startAt: futureDate(7), timezone: 'UTC' },
      FOUNDER_USER_ID, TEST_CONFIG
    );
    sessionService.setSessionStatus(session.id, 'canceled', FOUNDER_USER_ID);
    expect(() =>
      sessionService.updateSession(session.id, { title: 'New' }, FOUNDER_USER_ID)
    ).toThrow('Cannot edit');
  });
});

describe('setSessionStatus', () => {
  it('cancels a session', async () => {
    const game = await createGame();
    const session = sessionService.createSession(
      { gameId: game.id, startAt: futureDate(7), timezone: 'UTC' },
      FOUNDER_USER_ID, TEST_CONFIG
    );
    const canceled = sessionService.setSessionStatus(session.id, 'canceled', FOUNDER_USER_ID);
    expect(canceled.status).toBe('canceled');
  });

  it('marks a session complete', async () => {
    const game = await createGame();
    const session = sessionService.createSession(
      { gameId: game.id, startAt: futureDate(7), timezone: 'UTC' },
      FOUNDER_USER_ID, TEST_CONFIG
    );
    const completed = sessionService.setSessionStatus(session.id, 'completed', FOUNDER_USER_ID);
    expect(completed.status).toBe('completed');
  });

  it('throws when canceling an already-canceled session', async () => {
    const game = await createGame();
    const session = sessionService.createSession(
      { gameId: game.id, startAt: futureDate(7), timezone: 'UTC' },
      FOUNDER_USER_ID, TEST_CONFIG
    );
    sessionService.setSessionStatus(session.id, 'canceled', FOUNDER_USER_ID);
    expect(() =>
      sessionService.setSessionStatus(session.id, 'canceled', FOUNDER_USER_ID)
    ).toThrow('already');
  });
});

describe('getNextSession', () => {
  it('returns the soonest upcoming session', async () => {
    const game = await createGame();
    sessionService.createSession({ gameId: game.id, startAt: futureDate(10), timezone: 'UTC', title: 'Far' }, FOUNDER_USER_ID, TEST_CONFIG);
    sessionService.createSession({ gameId: game.id, startAt: futureDate(3), timezone: 'UTC', title: 'Near' }, FOUNDER_USER_ID, TEST_CONFIG);

    const next = sessionService.getNextSession(game.id);
    expect(next?.title).toBe('Near');
  });

  it('returns null when no upcoming sessions', async () => {
    const game = await createGame();
    expect(sessionService.getNextSession(game.id)).toBeNull();
  });
});
