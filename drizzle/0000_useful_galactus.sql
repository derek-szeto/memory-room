CREATE TABLE `members` (
	`room_id` text NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`last_seen` integer NOT NULL,
	PRIMARY KEY(`room_id`, `user_id`)
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text PRIMARY KEY NOT NULL,
	`room_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`kind` text NOT NULL,
	`pinned` integer DEFAULT 0 NOT NULL,
	`memory_date` text NOT NULL,
	`author` text NOT NULL,
	`editor` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`version` integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rooms` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`owner_id` text NOT NULL,
	`invite` text NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rooms_invite_unique` ON `rooms` (`invite`);