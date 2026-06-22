CREATE TABLE `.bootstrap-scaffold_automation_mode_activation_log` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`mode_id` text(255) NOT NULL,
	`room_id` text(255) NOT NULL,
	`triggered_by` text(10) NOT NULL,
	`target_on` integer NOT NULL,
	`status` text(10) NOT NULL,
	`error` text(500),
	`fired_at` integer NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`mode_id`) REFERENCES `.bootstrap-scaffold_automation_mode`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `.bootstrap-scaffold_room`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "mode_log_triggered_by_check" CHECK(".bootstrap-scaffold_automation_mode_activation_log"."triggered_by" IN ('schedule', 'manual')),
	CONSTRAINT "mode_log_status_check" CHECK(".bootstrap-scaffold_automation_mode_activation_log"."status" IN ('applied', 'skipped-pinned', 'failed'))
);
--> statement-breakpoint
CREATE INDEX `mode_log_mode_idx` ON `.bootstrap-scaffold_automation_mode_activation_log` (`mode_id`);--> statement-breakpoint
CREATE INDEX `mode_log_room_idx` ON `.bootstrap-scaffold_automation_mode_activation_log` (`room_id`);--> statement-breakpoint
CREATE INDEX `mode_log_fired_at_idx` ON `.bootstrap-scaffold_automation_mode_activation_log` (`fired_at`);--> statement-breakpoint
CREATE TABLE `.bootstrap-scaffold_automation_mode_target` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`mode_id` text(255) NOT NULL,
	`room_id` text(255) NOT NULL,
	`target_on` integer NOT NULL,
	FOREIGN KEY (`mode_id`) REFERENCES `.bootstrap-scaffold_automation_mode`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`room_id`) REFERENCES `.bootstrap-scaffold_room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `mode_target_room_idx` ON `.bootstrap-scaffold_automation_mode_target` (`room_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `mode_target_mode_room_unique` ON `.bootstrap-scaffold_automation_mode_target` (`mode_id`,`room_id`);--> statement-breakpoint
CREATE TABLE `.bootstrap-scaffold_automation_mode` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`days_of_week` text(20),
	`fire_hour` integer,
	`fire_minute` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer
);
