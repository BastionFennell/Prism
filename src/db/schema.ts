import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

// ── BotConfig ─────────────────────────────────────────────────────────────────
// Singleton row (id = 1). Stores all Discord-specific IDs that may change
// without requiring a code redeploy.
export const botConfig = sqliteTable('bot_config', {
  id:                integer('id').primaryKey(),
  guildId:           text('guild_id').notNull(),
  founderRoleId:     text('founder_role_id').notNull(),
  gamesChannelId:    text('games_channel_id').notNull(),
  scheduleChannelId: text('schedule_channel_id').notNull(),
  defaultTimezone:   text('default_timezone').notNull().default('UTC'),
  pooledRoleIds:     text('pooled_role_ids').notNull(), // JSON array of role ID strings
  rosterMessageId:   text('roster_message_id'),         // persistent games roster embed
});

// ── Game ──────────────────────────────────────────────────────────────────────
// status: 'recruiting' | 'active' | 'paused' | 'archived' | 'cleared'
export const games = sqliteTable('games', {
  id:              integer('id').primaryKey({ autoIncrement: true }),
  title:           text('title').notNull(),
  description:     text('description'),
  systemName:      text('system_name'),
  gmUserId:        text('gm_user_id').notNull(),
  status:          text('status').notNull().default('recruiting'),
  playerCap:       integer('player_cap'),
  discordThreadId: text('discord_thread_id'),
  discordRoleId:   text('discord_role_id'),
  createdAt:       integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt:       integer('updated_at', { mode: 'timestamp' }).notNull(),
  archivedAt:      integer('archived_at', { mode: 'timestamp' }),
  clearedAt:       integer('cleared_at', { mode: 'timestamp' }),
  finishedAt:      integer('finished_at', { mode: 'timestamp' }),
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
  reminder24hSentAt:   integer('reminder_24h_sent_at', { mode: 'timestamp' }),
  reminder2hSentAt:    integer('reminder_2h_sent_at',  { mode: 'timestamp' }),
});

// ── RSVP ──────────────────────────────────────────────────────────────────────
// response: 'yes' | 'no' | 'maybe'
export const rsvps = sqliteTable('rsvps', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  sessionId: integer('session_id').notNull().references(() => sessions.id),
  userId:    text('user_id').notNull(),
  response:  text('response').notNull(), // 'yes' | 'no' | 'maybe'
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
  imageUrl:      text('image_url'),   // Discord CDN URL of uploaded image
  imageName:     text('image_name'),  // original filename
  sheetUrl:      text('sheet_url'),   // Discord CDN URL of uploaded sheet
  sheetName:     text('sheet_name'),  // original filename
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
  metadata:    text('metadata'), // JSON string
  createdAt:   integer('created_at', { mode: 'timestamp' }).notNull(),
});

// ── SchedulePost ──────────────────────────────────────────────────────────────
// Tracks which Discord messages in the schedule channel the bot owns.
// Enables edit-in-place across restarts without losing message IDs.
export const schedulePosts = sqliteTable('schedule_posts', {
  id:        integer('id').primaryKey({ autoIncrement: true }),
  messageId: text('message_id').notNull(),
  position:  integer('position').notNull(), // sort order if multiple messages
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
});

// ── Inferred types for use throughout the app ─────────────────────────────────
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

export type GameStatus = 'recruiting' | 'active' | 'paused' | 'archived' | 'cleared' | 'finished';
export type SessionStatus = 'scheduled' | 'canceled' | 'completed';
export type RsvpResponse = 'yes' | 'no' | 'maybe';
