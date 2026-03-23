CREATE TABLE `scheduling_polls` (
  `id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
  `game_id` integer NOT NULL,
  `remote_poll_id` text NOT NULL,
  `discord_embed_message_id` text,
  `discord_poll_message_id` text,
  `status` text NOT NULL DEFAULT 'collecting',
  `expires_at` integer NOT NULL,
  `created_by_user_id` text NOT NULL,
  `scheduled_session_id` integer,
  `last_top_slots_hash` text,
  `created_at` integer NOT NULL,
  FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`scheduled_session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
