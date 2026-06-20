CREATE TABLE `.bootstrap-scaffold_default_threshold` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`min_temp_c` real NOT NULL,
	`max_temp_c` real NOT NULL,
	`anomaly_gap_c` real NOT NULL,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	CONSTRAINT "default_threshold_order_check" CHECK(".bootstrap-scaffold_default_threshold"."min_temp_c" < ".bootstrap-scaffold_default_threshold"."max_temp_c")
);
