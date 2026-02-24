CREATE TABLE `linkedin_searches` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `purpose` enum('hiring','investor','sales_prospect') NOT NULL,
  `keywords` varchar(500) NOT NULL,
  `jobTitle` varchar(255),
  `company` varchar(255),
  `industry` varchar(255),
  `location` varchar(255),
  `country` varchar(128),
  `seniority` varchar(128),
  `searchQuery` text NOT NULL,
  `resultCount` int NOT NULL DEFAULT 0,
  `status` enum('processing','completed','failed') NOT NULL DEFAULT 'processing',
  `errorMessage` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `linkedin_searches_id` PRIMARY KEY(`id`)
);

CREATE TABLE `linkedin_search_results` (
  `id` int AUTO_INCREMENT NOT NULL,
  `searchId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `headline` varchar(500),
  `profileUrl` varchar(512) NOT NULL,
  `snippet` text,
  `location` varchar(255),
  `company` varchar(255),
  `jobTitle` varchar(255),
  `industry` varchar(255),
  `relevanceScore` int DEFAULT 0,
  `enrichedData` text,
  `status` enum('new','saved','exported_to_crm','already_in_crm','dismissed') NOT NULL DEFAULT 'new',
  `crmContactId` int,
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT (now()),
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `linkedin_search_results_id` PRIMARY KEY(`id`)
);

CREATE INDEX `linkedin_searches_userId_idx` ON `linkedin_searches` (`userId`);
CREATE INDEX `linkedin_search_results_searchId_idx` ON `linkedin_search_results` (`searchId`);
