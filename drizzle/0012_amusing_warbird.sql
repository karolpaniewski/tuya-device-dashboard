CREATE TABLE `.bootstrap-scaffold_notification_contact` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`email` text(255) NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_notification_contact_email_unique` ON `.bootstrap-scaffold_notification_contact` (`email`);--> statement-breakpoint
CREATE TABLE `.bootstrap-scaffold_room_alert_state` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`room_id` text(255) NOT NULL,
	`last_badge` text(10) DEFAULT 'OK' NOT NULL,
	`entered_at` integer,
	`notified_at` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`room_id`) REFERENCES `.bootstrap-scaffold_room`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "room_alert_state_last_badge_check" CHECK(".bootstrap-scaffold_room_alert_state"."last_badge" IN ('OK', 'Too Cold', 'Too Hot'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_room_alert_state_room_id_unique` ON `.bootstrap-scaffold_room_alert_state` (`room_id`);