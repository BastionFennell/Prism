CREATE TABLE `character_entries` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`game_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`character_name` text NOT NULL,
	`summary` text,
	`details` text,
	`image_url` text,
	`sheet_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`game_id`) REFERENCES `games`(`id`) ON UPDATE no action ON DELETE no action
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
ALTER TABLE `sessions` ADD `reminder_24h_sent_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` ADD `reminder_2h_sent_at` integer;