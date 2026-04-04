ALTER TABLE bot_config ADD meeting_channel_id text;
--> statement-breakpoint
CREATE TABLE meetings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  start_at INTEGER NOT NULL,
  duration_minutes INTEGER,
  timezone TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  created_by_user_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  reminder_24h_sent_at INTEGER,
  reminder_30m_sent_at INTEGER,
  announcement_message_id TEXT
);
--> statement-breakpoint
CREATE TABLE meeting_polls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  remote_poll_id TEXT NOT NULL,
  discord_embed_message_id TEXT,
  discord_poll_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'collecting',
  expires_at INTEGER NOT NULL,
  created_by_user_id TEXT NOT NULL,
  scheduled_meeting_id INTEGER REFERENCES meetings(id),
  last_top_slots_hash TEXT,
  created_at INTEGER NOT NULL
);
