import { Collection, ChatInputCommandInteraction } from 'discord.js';
import { AppConfig } from '../config';
import { gameCommandData, handleGameCommand } from './game';
import { sessionCommandData, handleSessionCommand } from './session';
import { characterCommandData, handleCharacterCommand } from './character';
import { adminCommandData, handleAdminCommand } from './admin';

type CommandHandler = (interaction: ChatInputCommandInteraction, config: AppConfig) => Promise<void>;

export const commandHandlers: Collection<string, CommandHandler> = new Collection();
commandHandlers.set('game', handleGameCommand);
commandHandlers.set('session', handleSessionCommand);
commandHandlers.set('character', handleCharacterCommand);
commandHandlers.set('admin', handleAdminCommand);

export const commandDataList = [
  gameCommandData,
  sessionCommandData,
  characterCommandData,
  adminCommandData,
];
