CREATE TABLE `.bootstrap-scaffold_dashboard_layout` (
	`id` text(255) PRIMARY KEY NOT NULL,
	`widget_order` text NOT NULL,
	`hidden_widgets` text DEFAULT '[]' NOT NULL,
	`room_order` text DEFAULT '[]' NOT NULL,
	`updatedAt` integer
);
