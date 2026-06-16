CREATE TABLE `.bootstrap-scaffold_automation_execution_log` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`rule_id` text(255) NOT NULL,
	`fired_at` integer NOT NULL,
	`status` text(10) NOT NULL,
	`error` text(500),
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`rule_id`) REFERENCES `.bootstrap-scaffold_automation_rule`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "exec_log_status_check" CHECK(".bootstrap-scaffold_automation_execution_log"."status" IN ('success', 'failed', 'skipped'))
);
--> statement-breakpoint
CREATE INDEX `exec_log_rule_idx` ON `.bootstrap-scaffold_automation_execution_log` (`rule_id`);--> statement-breakpoint
CREATE INDEX `exec_log_fired_at_idx` ON `.bootstrap-scaffold_automation_execution_log` (`fired_at`);--> statement-breakpoint
CREATE TABLE `.bootstrap-scaffold_automation_rule` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`name` text(255) NOT NULL,
	`device_id` text(255) NOT NULL,
	`days_of_week` text(20) NOT NULL,
	`fire_hour` integer NOT NULL,
	`fire_minute` integer NOT NULL,
	`target_setpoint_c` real NOT NULL,
	`temp_threshold_c` real,
	`is_enabled` integer DEFAULT true NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`device_id`) REFERENCES `.bootstrap-scaffold_device`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "automation_rule_hour_check" CHECK(".bootstrap-scaffold_automation_rule"."fire_hour" BETWEEN 0 AND 23),
	CONSTRAINT "automation_rule_minute_check" CHECK(".bootstrap-scaffold_automation_rule"."fire_minute" BETWEEN 0 AND 59)
);
--> statement-breakpoint
CREATE INDEX `automation_rule_device_idx` ON `.bootstrap-scaffold_automation_rule` (`device_id`);