import { Collection, ChatInputCommandInteraction } from 'discord.js';
import { AppConfig } from '../config';
import { gameCommandData, handleGameCommand } from './game';
import { sessionCommandData, handleSessionCommand } from './session';
import { adminCommandData, handleAdminCommand } from './admin';
import { characterCommandData, handleCharacterCommand } from './character';

type CommandHandler = (interaction: ChatInputCommandInteraction, config: AppConfig) => Promise<void>;

export const commandHandlers: Collection<string, CommandHandler> = new Collection();
commandHandlers.set('game', handleGameCommand);
commandHandlers.set('session', handleSessionCommand);
commandHandlers.set('admin', handleAdminCommand);
commandHandlers.set('character', handleCharacterCommand);

export const commandDataList = [
  gameCommandData,
  sessionCommandData,
  adminCommandData,
  characterCommandData,
];
