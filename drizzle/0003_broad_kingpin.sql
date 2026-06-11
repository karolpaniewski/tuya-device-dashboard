CREATE TABLE `.bootstrap-scaffold_device_temperature_reading` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`tuya_device_id` text(255) NOT NULL,
	`temperature_c` real,
	`setpoint_c` real,
	`recorded_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE INDEX `reading_device_time_idx` ON `.bootstrap-scaffold_device_temperature_reading` (`tuya_device_id`,`recorded_at`);--> statement-breakpoint
CREATE INDEX `reading_time_idx` ON `.bootstrap-scaffold_device_temperature_reading` (`recorded_at`);