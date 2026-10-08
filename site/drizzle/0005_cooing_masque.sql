CREATE TABLE `chat_conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text,
	`title` text NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`summary_through` integer DEFAULT 0 NOT NULL,
	`lease` text,
	`lease_until` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_conversations_user_course` ON `chat_conversations` (`user_id`,`course_id`);--> statement-breakpoint
CREATE TABLE `material_vectors` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`material_id` text NOT NULL,
	`content_hash` text NOT NULL,
	`model` text NOT NULL,
	`embedding` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_vectors_user_material` ON `material_vectors` (`user_id`,`material_id`);--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `conversation_id` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `sequence` integer;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `request_id` text;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `sources_json` text DEFAULT '[]' NOT NULL;--> statement-breakpoint
ALTER TABLE `chat_messages` ADD `usage_json` text;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_sequence` ON `chat_messages` (`conversation_id`,`sequence`);--> statement-breakpoint
CREATE UNIQUE INDEX `idx_chat_request` ON `chat_messages` (`conversation_id`,`request_id`,`role`);--> statement-breakpoint
INSERT INTO chat_conversations (id,user_id,course_id,title,created_at,updated_at)
SELECT 'legacy-' || min(id),user_id,course_id,'Earlier conversation',min(created_at),max(created_at)
FROM chat_messages GROUP BY user_id,course_id;
--> statement-breakpoint
UPDATE chat_messages SET conversation_id=(SELECT id FROM chat_conversations c WHERE c.user_id=chat_messages.user_id AND c.course_id IS chat_messages.course_id);
--> statement-breakpoint
WITH numbered AS (SELECT id,row_number() OVER (PARTITION BY conversation_id ORDER BY created_at,CASE role WHEN 'user' THEN 0 ELSE 1 END,id) AS n FROM chat_messages)
UPDATE chat_messages SET sequence=(SELECT n FROM numbered WHERE numbered.id=chat_messages.id);
