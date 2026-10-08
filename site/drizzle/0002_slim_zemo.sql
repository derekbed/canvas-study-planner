CREATE TABLE `extension_pairings` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`expires_at` integer NOT NULL,
	`approved` integer DEFAULT 0 NOT NULL,
	`consumed` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE `extension_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_extension_sessions_user` ON `extension_sessions` (`user_id`);