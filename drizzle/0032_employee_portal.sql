-- Migration 0032: Employee Portal tables
-- Adds self-service HR tables: PTO balances, leave requests, onboarding tasks,
-- benefits enrollment, emergency contacts, and payslip fields on existing
-- employee_payments table.

ALTER TABLE `employee_payments`
  ADD COLUMN `grossAmount` decimal(15,2),
  ADD COLUMN `taxWithheld` decimal(15,2),
  ADD COLUMN `otherDeductions` decimal(15,2),
  ADD COLUMN `payslipUrl` text;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `pto_balances` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `leaveType` enum('vacation','sick','personal','parental','bereavement','unpaid','other') NOT NULL,
  `year` int NOT NULL,
  `accruedHours` decimal(8,2) NOT NULL DEFAULT '0',
  `usedHours` decimal(8,2) NOT NULL DEFAULT '0',
  `pendingHours` decimal(8,2) NOT NULL DEFAULT '0',
  `carryOverHours` decimal(8,2) NOT NULL DEFAULT '0',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `pto_balances_id` PRIMARY KEY(`id`),
  CONSTRAINT `pto_balances_emp_type_year_unique` UNIQUE(`employeeId`,`leaveType`,`year`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `leave_requests` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `leaveType` enum('vacation','sick','personal','parental','bereavement','unpaid','other') NOT NULL,
  `startDate` timestamp NOT NULL,
  `endDate` timestamp NOT NULL,
  `hours` decimal(8,2) NOT NULL,
  `reason` text,
  `status` enum('pending','approved','rejected','cancelled') NOT NULL DEFAULT 'pending',
  `approverId` int,
  `approvedAt` timestamp,
  `rejectionReason` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `leave_requests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `onboarding_tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `title` varchar(255) NOT NULL,
  `description` text,
  `category` enum('paperwork','training','equipment','access','introduction','acknowledgment','other') NOT NULL DEFAULT 'other',
  `dueDate` timestamp,
  `status` enum('pending','in_progress','completed','skipped') NOT NULL DEFAULT 'pending',
  `completedAt` timestamp,
  `sortOrder` int NOT NULL DEFAULT 0,
  `createdBy` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `onboarding_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `employee_benefits` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `benefitType` enum('health','dental','vision','retirement_401k','life_insurance','disability','hsa','fsa','commuter','other') NOT NULL,
  `plan` varchar(255),
  `carrier` varchar(255),
  `coverageLevel` enum('employee_only','employee_spouse','employee_children','family','waived'),
  `employeeContribution` decimal(15,2),
  `employerContribution` decimal(15,2),
  `contributionFrequency` enum('per_paycheck','monthly','annual') DEFAULT 'per_paycheck',
  `effectiveDate` timestamp,
  `endDate` timestamp,
  `enrollmentStatus` enum('enrolled','pending','waived','terminated') NOT NULL DEFAULT 'pending',
  `notes` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `employee_benefits_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `employee_emergency_contacts` (
  `id` int AUTO_INCREMENT NOT NULL,
  `employeeId` int NOT NULL,
  `name` varchar(255) NOT NULL,
  `relationship` varchar(64),
  `phone` varchar(32),
  `email` varchar(320),
  `address` text,
  `isPrimary` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `employee_emergency_contacts_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

ALTER TABLE `pto_balances`
  ADD CONSTRAINT `pto_balances_employeeId_employees_id_fk`
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `leave_requests`
  ADD CONSTRAINT `leave_requests_employeeId_employees_id_fk`
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `leave_requests`
  ADD CONSTRAINT `leave_requests_approverId_users_id_fk`
  FOREIGN KEY (`approverId`) REFERENCES `users`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `onboarding_tasks`
  ADD CONSTRAINT `onboarding_tasks_employeeId_employees_id_fk`
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `onboarding_tasks`
  ADD CONSTRAINT `onboarding_tasks_createdBy_users_id_fk`
  FOREIGN KEY (`createdBy`) REFERENCES `users`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `employee_benefits`
  ADD CONSTRAINT `employee_benefits_employeeId_employees_id_fk`
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint

ALTER TABLE `employee_emergency_contacts`
  ADD CONSTRAINT `employee_emergency_contacts_employeeId_employees_id_fk`
  FOREIGN KEY (`employeeId`) REFERENCES `employees`(`id`)
  ON DELETE NO ACTION ON UPDATE NO ACTION;
