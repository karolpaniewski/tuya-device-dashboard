CREATE TABLE `.bootstrap-scaffold_room_heat_state` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`room_id` text(255) NOT NULL,
	`pinned_off` integer DEFAULT false NOT NULL,
	`pinned_at` integer,
	`released_at` integer,
	`createdAt` integer DEFAULT (unixepoch()) NOT NULL,
	`updatedAt` integer,
	FOREIGN KEY (`room_id`) REFERENCES `.bootstrap-scaffold_room`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `.bootstrap-scaffold_room_heat_state_room_id_unique` ON `.bootstrap-scaffold_room_heat_state` (`room_id`);