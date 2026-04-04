import { Collection, ChatInputCommandInteraction } from 'discord.js';
import { AppConfig } from '../config';
import { gameCommandData, handleGameCommand } from './game';
import { sessionCommandData, handleSessionCommand } from './session';
import { characterCommandData, handleCharacterCommand } from './character';
import { adminCommandData, handleAdminCommand } from './admin';
import { scheduleAnnouncementCommandData, cancelAnnouncementCommandData, rescheduleAnnouncementCommandData, getFeedbackCommandData } from './scheduleAnnouncement';
import { feedbackCommandData, handleFeedbackCommand } from './feedback';
import { meetingCommandData, handleMeetingCommand } from './meeting';

type CommandHandler = (interaction: ChatInputCommandInteraction, config: AppConfig) => Promise<void>;

export const commandHandlers: Collection<string, CommandHandler> = new Collection();
commandHandlers.set('game', handleGameCommand);
commandHandlers.set('session', handleSessionCommand);
commandHandlers.set('character', handleCharacterCommand);
commandHandlers.set('admin', handleAdminCommand);
commandHandlers.set('feedback', handleFeedbackCommand);
commandHandlers.set('meeting', handleMeetingCommand);

export const commandDataList = [
  gameCommandData,
  sessionCommandData,
  characterCommandData,
  adminCommandData,
  feedbackCommandData,
  meetingCommandData,
  scheduleAnnouncementCommandData,
  cancelAnnouncementCommandData,
  rescheduleAnnouncementCommandData,
  getFeedbackCommandData,
];
