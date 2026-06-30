CREATE TABLE `.bootstrap-scaffold_event_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`event_type` text NOT NULL,
	`room_id` text(255),
	`device_id` text(255),
	`payload` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `event_log_created_at_idx` ON `.bootstrap-scaffold_event_log` (`created_at`);