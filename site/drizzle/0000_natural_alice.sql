CREATE TABLE `canvas_connections` (
	`user_id` text PRIMARY KEY NOT NULL,
	`base_url` text NOT NULL,
	`access_token` text NOT NULL,
	`refresh_token` text NOT NULL,
	`expires_at` text,
	`last_sync_at` text
);
--> statement-breakpoint
CREATE TABLE `chat_messages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_chat_user_course` ON `chat_messages` (`user_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`canvas_id` text,
	`name` text NOT NULL,
	`code` text DEFAULT '' NOT NULL,
	`color` text DEFAULT 'blue' NOT NULL,
	`target_grade` real DEFAULT 90 NOT NULL,
	`current_grade` real,
	`grade_weights` text DEFAULT '{}' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_courses_user` ON `courses` (`user_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_courses_canvas` ON `courses` (`user_id`,`canvas_id`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`canvas_id` text,
	`title` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`due_at` text NOT NULL,
	`kind` text DEFAULT 'assignment' NOT NULL,
	`points_possible` real,
	`points_earned` real,
	`status` text DEFAULT 'upcoming' NOT NULL,
	`source` text DEFAULT 'manual' NOT NULL,
	`url` text,
	`estimated_minutes` integer DEFAULT 60 NOT NULL,
	`grade_group` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_events_user_due` ON `events` (`user_id`,`due_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_canvas` ON `events` (`user_id`,`canvas_id`);--> statement-breakpoint
CREATE TABLE `materials` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text DEFAULT 'notes' NOT NULL,
	`mime_type` text DEFAULT 'text/plain' NOT NULL,
	`r2_key` text,
	`extracted_text` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_materials_user_course` ON `materials` (`user_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`available_days` text DEFAULT '[1,2,3,4,5]' NOT NULL,
	`hours_per_week` real DEFAULT 8 NOT NULL,
	`reminder_hours` integer DEFAULT 24 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `study_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`event_id` text,
	`starts_at` text NOT NULL,
	`minutes` integer NOT NULL,
	`status` text DEFAULT 'planned' NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_blocks_user_start` ON `study_blocks` (`user_id`,`starts_at`);