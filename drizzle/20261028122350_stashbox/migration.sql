CREATE TABLE `items` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`parent_id` text,
	`type` text NOT NULL,
	`name` text NOT NULL,
	`storage_key` text,
	`size` integer DEFAULT 0 NOT NULL,
	`mime_type` text,
	`starred` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	`recent_at` integer,
	`trashed_at` integer,
	`trash_batch` text,
	`trash_root` integer DEFAULT false NOT NULL,
	`trash_path` text,
	CONSTRAINT `fk_items_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `shares` (
	`id` text PRIMARY KEY,
	`token` text NOT NULL UNIQUE,
	`user_id` text NOT NULL,
	`item_id` text NOT NULL,
	`expires_at` integer,
	`password_hash` text,
	`allow_download` integer DEFAULT true NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_shares_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE,
	CONSTRAINT `fk_shares_item_id_items_id_fk` FOREIGN KEY (`item_id`) REFERENCES `items`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE TABLE `uploads` (
	`id` text PRIMARY KEY,
	`user_id` text NOT NULL,
	`parent_id` text,
	`name` text NOT NULL,
	`size` integer NOT NULL,
	`mime_type` text NOT NULL,
	`storage_key` text NOT NULL,
	`created_at` integer NOT NULL,
	CONSTRAINT `fk_uploads_user_id_user_id_fk` FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX `items_user_parent_idx` ON `items` (`user_id`,`parent_id`);--> statement-breakpoint
CREATE INDEX `items_user_trashed_idx` ON `items` (`user_id`,`trashed_at`);--> statement-breakpoint
CREATE INDEX `items_trash_batch_idx` ON `items` (`trash_batch`);--> statement-breakpoint
CREATE INDEX `items_storage_key_idx` ON `items` (`storage_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `shares_item_idx` ON `shares` (`item_id`);--> statement-breakpoint
CREATE INDEX `shares_user_idx` ON `shares` (`user_id`);--> statement-breakpoint
CREATE INDEX `uploads_user_idx` ON `uploads` (`user_id`);