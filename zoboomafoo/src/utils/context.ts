import { ChatInputCommandInteraction } from 'discord.js';
import { GameService } from '../services/GameService';
import { MembershipService } from '../services/MembershipService';
import { Game } from '../db/schema';
import { AppConfig } from '../config';
import { AppError } from './errors';
import { isFounder } from '../permissions';

/**
 * Resolves the game for a command. If the `game` option was provided, use it.
 * Otherwise, infer from the channel the command was run in.
 * Throws if neither resolves.
 */
export function resolveGame(
  interaction: ChatInputCommandInteraction,
  gameService: GameService
): Game {
  const explicit = interaction.options.getInteger('game');
  if (explicit) return gameService.getGame(explicit);

  const byChannel = gameService.findGameByChannelId(interaction.channelId);
  if (byChannel) return byChannel;

  throw new AppError('Please specify a game, or run this command from a game channel.');
}

/**
 * Throws if the user is not a Founder and is not an active member of the game.
 */
export function requireMembership(
  interaction: ChatInputCommandInteraction,
  game: Game,
  membershipService: MembershipService,
  config: AppConfig
): void {
  if (isFounder(interaction.member!, config)) return;
  if (membershipService.isMember(game.id, interaction.user.id)) return;
  throw new AppError('You are not a member of this game.');
}
