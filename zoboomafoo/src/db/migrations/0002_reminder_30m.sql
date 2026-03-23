ALTER TABLE `sessions` ADD `reminder_30m_sent_at` integer;--> statement-breakpoint
ALTER TABLE `sessions` DROP COLUMN `reminder_2h_sent_at`;
