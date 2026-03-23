import { eq, and, asc } from 'drizzle-orm';
import { DB } from '../db';
import { characterEntries, games, CharacterEntry } from '../db/schema';
import { AppError } from '../utils/errors';
import { AuditService } from './AuditService';

export interface CreateCharacterInput {
  characterName: string;
  summary?: string;
  details?: string;
  imageUrl?: string;
  imageName?: string;
  sheetUrl?: string;
  sheetName?: string;
}

export class CharacterService {
  private readonly auditService: AuditService;

  constructor(private readonly db: DB) {
    this.auditService = new AuditService(db);
  }

  addCharacter(
    gameId: number,
    userId: string,
    input: CreateCharacterInput,
    actorUserId: string
  ): CharacterEntry {
    const [game] = this.db.select().from(games).where(eq(games.id, gameId)).all();
    if (!game) throw new AppError(`Game #${gameId} not found.`);

    if (['archived', 'finished'].includes(game.status)) {
      throw new AppError('Cannot add a character to an archived or finished game.');
    }

    const now = new Date();
    const result = this.db
      .insert(characterEntries)
      .values({ gameId, userId, ...input, createdAt: now, updatedAt: now })
      .returning()
      .get();

    this.auditService.log(actorUserId, 'character.added', 'game', gameId, { characterName: input.characterName });
    return result;
  }

  editCharacter(
    characterId: number,
    actorUserId: string,
    isFounder: boolean,
    updates: Partial<CreateCharacterInput>
  ): CharacterEntry {
    const [character] = this.db.select().from(characterEntries).where(eq(characterEntries.id, characterId)).all();
    if (!character) throw new AppError('Character not found.');

    const canEdit = character.userId === actorUserId || isFounder;
    if (!canEdit) throw new AppError('You can only edit your own characters.');

    const result = this.db
      .update(characterEntries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(characterEntries.id, characterId))
      .returning()
      .get();

    this.auditService.log(actorUserId, 'character.updated', 'character', characterId);
    return result;
  }

  removeCharacter(
    characterId: number,
    actorUserId: string,
    isFounder: boolean
  ): void {
    const [character] = this.db.select().from(characterEntries).where(eq(characterEntries.id, characterId)).all();
    if (!character) throw new AppError('Character not found.');

    const canRemove = character.userId === actorUserId || isFounder;
    if (!canRemove) throw new AppError('You can only remove your own characters.');

    this.db.delete(characterEntries).where(eq(characterEntries.id, characterId)).run();
    this.auditService.log(actorUserId, 'character.removed', 'character', characterId);
  }

  getCharactersForGame(gameId: number): CharacterEntry[] {
    return this.db
      .select()
      .from(characterEntries)
      .where(eq(characterEntries.gameId, gameId))
      .orderBy(asc(characterEntries.characterName))
      .all();
  }

  findCharacterByName(gameId: number, characterName: string): CharacterEntry | null {
    return this.db
      .select()
      .from(characterEntries)
      .where(and(eq(characterEntries.gameId, gameId), eq(characterEntries.characterName, characterName)))
      .all()[0] ?? null;
  }

  getCharactersForUser(userId: string): CharacterEntry[] {
    return this.db
      .select()
      .from(characterEntries)
      .where(eq(characterEntries.userId, userId))
      .orderBy(asc(characterEntries.characterName))
      .all();
  }
}
