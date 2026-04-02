import { AutocompleteInteraction } from 'discord.js';
import { AppConfig } from '../config';
import { db } from '../db';
import { client } from '../client';
import { GameService } from '../services/GameService';
import { SessionService } from '../services/SessionService';

export async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  config: AppConfig
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const gameService = new GameService(db, client);
  const sessionService = new SessionService(db);

  try {
    if (focused.name === 'game') {
      const search = String(focused.value);
      const games = gameService.findGamesByTitle(search).slice(0, 25);
      await interaction.respond(
        games.map((g) => ({ name: g.title, value: g.id }))
      );
      return;
    }

    if (focused.name === 'session') {
      const gameId = interaction.options.get('game')?.value as number | undefined;

      const sessions = gameId
        ? sessionService.getUpcomingSessions(gameId).slice(0, 25)
        : sessionService.getUpcomingSessions().slice(0, 25);

      await interaction.respond(
        sessions.map((s) => ({
          name: s.title ?? `Session on ${s.startAt.toLocaleDateString()}`,
          value: s.id,
        }))
      );
      return;
    }
  } catch {
    await interaction.respond([]);
  }
}
