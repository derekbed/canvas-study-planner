CREATE TABLE `course_knowledge` (
	`course_id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`brief` text DEFAULT '' NOT NULL,
	`facts_json` text DEFAULT '[]' NOT NULL,
	`gaps_json` text DEFAULT '[]' NOT NULL,
	`memory_summary` text DEFAULT '' NOT NULL,
	`memory_through_id` text,
	`source_material_id` text,
	`status` text DEFAULT 'empty' NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_course_knowledge_user` ON `course_knowledge` (`user_id`);--> statement-breakpoint
CREATE TABLE `course_passages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`material_id` text NOT NULL,
	`source_label` text NOT NULL,
	`text` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_course_passages_user_course` ON `course_passages` (`user_id`,`course_id`);--> statement-breakpoint
CREATE INDEX `idx_course_passages_material` ON `course_passages` (`material_id`);