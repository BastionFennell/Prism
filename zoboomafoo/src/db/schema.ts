import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ── BotConfig ─────────────────────────────────────────────────────────────────
// Singleton row (id = 1). Stores all Discord-specific IDs.
export const botConfig = sqliteTable('bot_config', {
  id:                 integer('id').primaryKey(),
  guildId:            text('guild_id').notNull(),
  founderRoleId:      text('founder_role_id').notNull(),
  gamesCategoryId:    text('games_category_id').notNull(),    // category for active game channels
  archivedCategoryId: text('archived_category_id').notNull(), // category for archived game channels
  scheduleChannelId:  text('schedule_channel_id').notNull(),  // global Founders schedule channel
  defaultTimezone:    text('default_timezone').notNull().default('UTC'),
  rosterMessageId:    text('roster_message_id'),              // persistent games roster embed
});

// ── Game ──────────────────────────────────────────────────────────────────────
// status: 'active' | 'paused' | 'archived' | 'finished'
export const games = sqliteTable('games', {
  id:                integer('id').primaryKey({ autoIncrement: true }),
  title:             text('title').notNull(),
  description:       text('description'),
  systemName:        text('system_name'),
  gmUserId:          text('gm_user_id').notNull(),
  status:            text('status').notNull().default('active'),
  discordChannelId:  text('discord_channel_id'), // dedicated game channel
  discordRoleId:     text('discord_role_id'),    // auto-created role for this game
  scheduleMessageId: text('schedule_message_id'), // pinned schedule embed in game channel
  createdAt:         integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:         integer('updated_at', { mode: 'timestamp' }).notNull(),
  archivedAt:        integer('archived_at', { mode: 'timestamp' }),
  finishedAt:        integer('finished_at', { mode: 'timestamp' }),
});

// ── GameMembership ────────────────────────────────────────────────────────────
export const gameMemberships = sqliteTable('game_memberships', {
  id:       integer('id').primaryKey({ autoIncrement: true }),
  gameId:   integer('game_id').notNull().references(() => games.id),
  userId:   text('user_id').notNull(),
  active:   integer('active', { mode: 'boolean' }).notNull().default(true),
  joinedAt: integer('joined_at', { mode: 'timestamp' }).notNull(),
  leftAt:   integer('left_at', { mode: 'timestamp' }),
});

// ── Session ───────────────────────────────────────────────────────────────────
// status: 'scheduled' | 'canceled' | 'completed'
export const sessions = sqliteTable('sessions', {
  id:                  integer('id').primaryKey({ autoIncrement: true }),
  gameId:              integer('game_id').notNull().references(() => games.id),
  title:               text('title'),
  notes:               text('notes'),
  startAt:             integer('start_at', { mode: 'timestamp' }).notNull(),
  durationMinutes:     integer('duration_minutes'),
  timezone:            text('timezone').notNull(),
  status:              text('status').notNull().default('scheduled'),
  createdByUserId:     text('created_by_user_id').notNull(),
  createdAt:           integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:           integer('updated_at', { mode: 'timestamp' }).notNull(),
  reminder24hSentAt:   integer('reminder_24h_sent_at',  { mode: 'timestamp' }),
  reminder30mSentAt:   integer('reminder_30m_sent_at',  { mode: 'timestamp' }),
  rsvpMessageId:       text('rsvp_message_id'), // per-session announcement embed in game channel
});

// ── RSVP ──────────────────────────────────────────────────────────────────────
// response: 'yes' | 'no' | 'maybe'
export const rsvps = sqliteTable('rsvps', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => sessions.id),
  userId:    text('user_id').notNull(),
  response:  text('response').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ── CharacterEntry ────────────────────────────────────────────────────────────
export const characterEntries = sqliteTable('character_entries', {
  id:            integer('id').primaryKey({ autoIncrement: true }),
  gameId:        integer('game_id').notNull().references(() => games.id),
  userId:        text('user_id').notNull(),
  characterName: text('character_name').notNull(),
  summary:       text('summary'),
  details:       text('details'),
  imageUrl:      text('image_url'),
  imageName:     text('image_name'),
  sheetUrl:      text('sheet_url'),
  sheetName:     text('sheet_name'),
  createdAt:     integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:     integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ── AuditLog ──────────────────────────────────────────────────────────────────
export const auditLogs = sqliteTable('audit_logs', {
  id:          integer('id').primaryKey({ autoIncrement: true }),
  actorUserId: text('actor_user_id').notNull(),
  actionType:  text('action_type').notNull(),
  entityType:  text('entity_type').notNull(),
  entityId:    text('entity_id'),
  metadata:    text('metadata'),
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ── SchedulePost ──────────────────────────────────────────────────────────────
export const schedulePosts = sqliteTable('schedule_posts', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  messageId: text('message_id').notNull(),
  position:  integer('position').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ── AnnouncementQueue ─────────────────────────────────────────────────────────
export const announcementQueue = sqliteTable('announcement_queue', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  messageId:       text('message_id').notNull(),       // Discord message ID to relay
  sourceChannelId: text('source_channel_id').notNull(), // channel the message lives in
  targetChannelId: text('target_channel_id').notNull(), // channel to post it to
  sendAt:          integer('send_at', { mode: 'timestamp' }).notNull(),
  sentAt:          integer('sent_at', { mode: 'timestamp' }),
  createdByUserId: text('created_by_user_id').notNull(),
  createdAt:       integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ── SchedulingPoll ─────────────────────────────────────────────────────────────
// Tracks an active WhenIsGood-style availability poll.
// status: 'collecting' | 'voting' | 'confirming' | 'completed' | 'expired'
export const schedulingPolls = sqliteTable('scheduling_polls', {
  id:                    integer('id').primaryKey({ autoIncrement: true }),
  gameId:                integer('game_id').notNull().references(() => games.id),
  remotePollId:          text('remote_poll_id').notNull(),           // cuid from Streaming Rainbow
  discordEmbedMessageId: text('discord_embed_message_id'),           // live embed in game channel
  discordPollMessageId:  text('discord_poll_message_id'),            // Discord native poll message
  status:                text('status').notNull().default('collecting'),
  expiresAt:             integer('expires_at').notNull(),             // unix ms
  createdByUserId:       text('created_by_user_id').notNull(),
  scheduledSessionId:    integer('scheduled_session_id').references(() => sessions.id),
  lastTopSlotsHash:      text('last_top_slots_hash'),                 // detect embed update needed
  createdAt:             integer('created_at').notNull().$defaultFn(() => Date.now()),
});

// ── Inferred types ────────────────────────────────────────────────────────────
export type BotConfig = typeof botConfig.$inferSelect;
export type Game = typeof games.$inferSelect;
export type NewGame = typeof games.$inferInsert;
export type GameMembership = typeof gameMemberships.$inferSelect;
export type Session = typeof sessions.$inferSelect;
export type NewSession = typeof sessions.$inferInsert;
export type Rsvp = typeof rsvps.$inferSelect;
export type CharacterEntry = typeof characterEntries.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type SchedulePost = typeof schedulePosts.$inferSelect;
export type AnnouncementQueueEntry = typeof announcementQueue.$inferSelect;
export type SchedulingPoll = typeof schedulingPolls.$inferSelect;

export type GameStatus = 'active' | 'paused' | 'archived' | 'finished';
export type SessionStatus = 'scheduled' | 'canceled' | 'completed';
export type RsvpResponse = 'yes' | 'no' | 'maybe';
