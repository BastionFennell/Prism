import { AutocompleteInteraction } from 'discord.js';
import { AppConfig } from '../config';
import { db } from '../db';
import { client } from '../client';
import { GameService } from '../services/GameService';
import { SessionService } from '../services/SessionService';

export async function handleAutocomplete(
  interaction: AutocompleteInteraction,
  _config: AppConfig
): Promise<void> {
  const focused = interaction.options.getFocused(true);
  const gameService = new GameService(db, client);
  const sessionService = new SessionService(db);

  try {
    if (focused.name === 'game') {
      const search = String(focused.value);

      // If in a game channel, surface that game first
      const contextGame = gameService.findGameByChannelId(interaction.channelId);
      const matches = gameService.findGamesByTitle(search).slice(0, 25);

      // Deduplicate: put context game first, then others
      const others = matches.filter((g) => g.id !== contextGame?.id);
      const ordered = contextGame ? [contextGame, ...others] : others;

      await interaction.respond(
        ordered.slice(0, 25).map((g) => ({ name: g.title, value: g.id }))
      );
      return;
    }

    if (focused.name === 'timezone') {
      await interaction.respond([
        { name: 'Pacific (PT)',  value: 'America/Los_Angeles' },
        { name: 'Mountain (MT)', value: 'America/Denver' },
        { name: 'Central (CT)',  value: 'America/Chicago' },
        { name: 'Eastern (ET)',  value: 'America/New_York' },
      ]);
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
