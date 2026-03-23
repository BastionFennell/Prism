CREATE TABLE `announcement_queue` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`message_id` text NOT NULL,
	`source_channel_id` text NOT NULL,
	`target_channel_id` text NOT NULL,
	`send_at` integer NOT NULL,
	`sent_at` integer,
	`created_by_user_id` text NOT NULL,
	`created_at` integer NOT NULL
);
