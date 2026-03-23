CREATE TABLE `audit_logs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`actor_user_id` text NOT NULL,
	`action_type` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`metadata` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `bot_config` (
	`id` integer PRIMARY KEY NOT NULL,
	`guild_id` text NOT NULL,
	`founder_role_id` text NOT NULL,
	`games_category_id` text NOT NULL,
	`archived_category_id` text NOT NULL,
	`schedule_channel_id` text NOT NULL,
	`default_timezone` text DEFAULT 'UTC' NOT NULL,
	`roster_message_id` text
);
--> statement-breakpoint
CREATE TABLE `character_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`character_name` text NOT NULL,
	`summary` text,
	`details` text,
	`image_url` text,
	`image_name` text,
	`sheet_url` text,
	`sheet_name` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `game_memberships` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`joined_at` integer NOT NULL,
	`left_at` integer,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `games` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`system_name` text,
	`gm_user_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`discord_channel_id` text,
	`discord_role_id` text,
	`schedule_message_id` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`archived_at` integer,
	`finished_at` integer
);
--> statement-breakpoint
CREATE TABLE `rsvps` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`session_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`response` text NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `schedule_posts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`position` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`title` text,
	`notes` text,
	`start_at` integer NOT NULL,
	`duration_minutes` integer,
	`timezone` text NOT NULL,
	`status` text DEFAULT 'scheduled' NOT NULL,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`reminder_24h_sent_at` integer,
	`reminder_2h_sent_at` integer,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
);
