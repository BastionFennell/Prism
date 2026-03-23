import { MessageReaction, PartialMessageReaction, User, PartialUser } from 'discord.js';
import { eq } from 'drizzle-orm';
import { db } from '../db';
import { sessions, games } from '../db/schema';
import { client } from '../client';
import { loadConfig } from '../config';
import { RsvpService } from '../services/RsvpService';
import { ScheduleService } from '../services/ScheduleService';
import { RsvpResponse } from '../db/schema';

const EMOJI_TO_RESPONSE: Record<string, RsvpResponse> = {
  '✅': 'yes',
  '❌': 'no',
  '❓': 'maybe',
};

async function resolveSession(messageId: string) {
  const [session] = db.select().from(sessions).where(eq(sessions.rsvpMessageId, messageId)).all();
  if (!session) return null;
  const [game] = db.select().from(games).where(eq(games.id, session.gameId)).all();
  if (!game) return null;
  return { session, game };
}

export async function handleReactionAdd(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  if (user.bot) return;

  const response = reaction.emoji.name ? EMOJI_TO_RESPONSE[reaction.emoji.name] : undefined;
  if (!response) return;

  if (reaction.partial) reaction = await reaction.fetch();
  if (user.partial) user = await user.fetch();

  const result = await resolveSession(reaction.message.id);
  if (!result) return;

  const { session, game } = result;

  const rsvpService = new RsvpService(db);
  rsvpService.setRsvp(session.id, user.id, response);

  const scheduleService = new ScheduleService(db, client, loadConfig());
  await scheduleService.updateSessionAnnouncement(session.id, game);
}

export async function handleReactionRemove(
  reaction: MessageReaction | PartialMessageReaction,
  user: User | PartialUser
): Promise<void> {
  if (user.bot) return;

  const response = reaction.emoji.name ? EMOJI_TO_RESPONSE[reaction.emoji.name] : undefined;
  if (!response) return;

  if (reaction.partial) reaction = await reaction.fetch();
  if (user.partial) user = await user.fetch();

  const result = await resolveSession(reaction.message.id);
  if (!result) return;

  const { session, game } = result;

  const rsvpService = new RsvpService(db);
  const existing = rsvpService.getUserRsvp(session.id, user.id);
  if (existing?.response === response) {
    rsvpService.removeRsvp(session.id, user.id);
  }

  const scheduleService = new ScheduleService(db, client, loadConfig());
  await scheduleService.updateSessionAnnouncement(session.id, game);
}
