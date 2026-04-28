CREATE TABLE IF NOT EXISTS `fireflies_configs` (
    `id` int AUTO_INCREMENT NOT NULL,
    `userId` int NOT NULL,
    `apiKey` varchar(512) NOT NULL,
    `autoCreateContacts` boolean DEFAULT false,
    `autoCreateTasks` boolean DEFAULT false,
    `autoCreateProjects` boolean DEFAULT false,
    `createdAt` timestamp NOT NULL DEFAULT (now()),
    `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT `fireflies_configs_id` PRIMARY KEY(`id`)
  );
