CREATE TABLE `calendar_imports` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_import_at` text NOT NULL,
	`summary` text DEFAULT '{}' NOT NULL
);
--> statement-breakpoint
CREATE TABLE `flashcards` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`source` text DEFAULT '' NOT NULL,
	`due_at` text NOT NULL,
	`interval_days` integer DEFAULT 0 NOT NULL,
	`reviews` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_flashcards_user_due` ON `flashcards` (`user_id`,`due_at`);--> statement-breakpoint
CREATE TABLE `focus_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`minutes` integer NOT NULL,
	`completed_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_focus_user` ON `focus_sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `grade_history` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`grade` real NOT NULL,
	`recorded_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_grades_user_course` ON `grade_history` (`user_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `preferences` (
	`user_id` text PRIMARY KEY NOT NULL,
	`value` text DEFAULT '{}' NOT NULL
);
