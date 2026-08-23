CREATE TABLE IF NOT EXISTS `purchaseOrderApprovals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`purchaseOrderId` int NOT NULL,
	`level` int NOT NULL,
	`decision` enum('approved','rejected') NOT NULL,
	`decidedBy` int NOT NULL,
	`decidedAt` timestamp NOT NULL DEFAULT (now()),
	`decidedByRole` varchar(64),
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `purchaseOrderApprovals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `purchaseOrderApprovals_po_idx` ON `purchaseOrderApprovals` (`purchaseOrderId`);
--> statement-breakpoint
ALTER TABLE `purchaseOrderApprovals` ADD CONSTRAINT `purchaseOrderApprovals_purchaseOrderId_purchase_orders_id_fk` FOREIGN KEY (`purchaseOrderId`) REFERENCES `purchase_orders`(`id`) ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE `purchaseOrderApprovals` ADD CONSTRAINT `purchaseOrderApprovals_decidedBy_users_id_fk` FOREIGN KEY (`decidedBy`) REFERENCES `users`(`id`) ON DELETE no action ON UPDATE no action;
