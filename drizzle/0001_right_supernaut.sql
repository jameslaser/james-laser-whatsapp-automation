CREATE TABLE `appointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int,
	`leadId` int,
	`bookingRequestId` int,
	`treatmentCode` varchar(64) NOT NULL,
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`machineName` varchar(64) NOT NULL,
	`status` enum('Confirmed','Arrived','Completed') NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `auditLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`action` varchar(64) NOT NULL,
	`entityType` varchar(64) NOT NULL,
	`entityId` varchar(64),
	`actorId` int,
	`metadata` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `auditLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `availabilities` (
	`id` int AUTO_INCREMENT NOT NULL,
	`staffId` int,
	`machineName` varchar(64),
	`startsAt` timestamp NOT NULL,
	`endsAt` timestamp NOT NULL,
	`kind` enum('OPEN','BLOCKED') NOT NULL,
	`reason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `availabilities_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `bookingRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`patientId` int,
	`leadId` int,
	`treatmentCode` varchar(64) NOT NULL,
	`requestedDate` timestamp NOT NULL,
	`selectedStartsAt` timestamp,
	`status` enum('DRAFT','OFFERED','CONFIRMED','CANCELLED') NOT NULL DEFAULT 'DRAFT',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `bookingRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `leads` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(255),
	`phoneNumber` varchar(32) NOT NULL,
	`source` varchar(64) NOT NULL DEFAULT 'whatsapp',
	`status` varchar(32) NOT NULL DEFAULT 'new',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `leads_id` PRIMARY KEY(`id`),
	CONSTRAINT `leads_phoneNumber_unique` UNIQUE(`phoneNumber`)
);
--> statement-breakpoint
CREATE TABLE `machines` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(64) NOT NULL,
	`active` boolean NOT NULL DEFAULT true,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `machines_id` PRIMARY KEY(`id`),
	CONSTRAINT `machines_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `notifications` (
	`id` int AUTO_INCREMENT NOT NULL,
	`appointmentId` int,
	`patientId` int,
	`channel` enum('WHATSAPP','INTERNAL') NOT NULL,
	`type` varchar(64) NOT NULL,
	`scheduledAt` timestamp NOT NULL,
	`status` enum('PENDING','PROCESSING','SENT','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`attempts` int NOT NULL DEFAULT 0,
	`lastAttemptAt` timestamp,
	`error` text,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `notifications_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `patients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`fullName` varchar(255) NOT NULL,
	`phoneNumber` varchar(32) NOT NULL,
	`preferredLanguage` enum('ar','en') NOT NULL DEFAULT 'en',
	`tags` json,
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `patients_id` PRIMARY KEY(`id`),
	CONSTRAINT `patients_phoneNumber_unique` UNIQUE(`phoneNumber`)
);
--> statement-breakpoint
CREATE TABLE `whatsappAssignments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`staffId` int NOT NULL,
	`assignedAt` timestamp NOT NULL DEFAULT (now()),
	`releasedAt` timestamp,
	CONSTRAINT `whatsappAssignments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsappAutomations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`type` varchar(64) NOT NULL,
	`appointmentId` int,
	`contactId` int,
	`scheduledAt` timestamp NOT NULL,
	`status` enum('PENDING','PROCESSING','SENT','FAILED','CANCELLED') NOT NULL DEFAULT 'PENDING',
	`attempts` int NOT NULL DEFAULT 0,
	`lastAttemptAt` timestamp,
	`error` text,
	`completedAt` timestamp,
	`idempotencyKey` varchar(255) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsappAutomations_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsappAutomations_idempotencyKey_unique` UNIQUE(`idempotencyKey`)
);
--> statement-breakpoint
CREATE TABLE `whatsappCampaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`templateId` int NOT NULL,
	`languageCode` varchar(16) NOT NULL,
	`scheduledAt` timestamp,
	`status` varchar(32) NOT NULL DEFAULT 'DRAFT',
	`consentRequired` boolean NOT NULL DEFAULT true,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappCampaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsappContacts` (
	`id` int AUTO_INCREMENT NOT NULL,
	`phoneNumber` varchar(32) NOT NULL,
	`patientId` int,
	`leadId` int,
	`optedOut` boolean NOT NULL DEFAULT false,
	`displayName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappContacts_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsappContacts_phoneNumber_unique` UNIQUE(`phoneNumber`)
);
--> statement-breakpoint
CREATE TABLE `whatsappConversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`status` enum('AI_ACTIVE','HUMAN_REQUIRED','HUMAN_ACTIVE','CLOSED') NOT NULL DEFAULT 'AI_ACTIVE',
	`aiPaused` boolean NOT NULL DEFAULT false,
	`assignedStaffId` int,
	`lastActivityAt` timestamp NOT NULL DEFAULT (now()),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappConversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsappMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`contactId` int NOT NULL,
	`waMessageId` varchar(255) NOT NULL,
	`direction` enum('INBOUND','OUTBOUND') NOT NULL,
	`kind` varchar(32) NOT NULL,
	`body` text,
	`mediaId` varchar(255),
	`status` varchar(32) NOT NULL,
	`rawPayload` json,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappMessages_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsappMessages_waMessageId_unique` UNIQUE(`waMessageId`)
);
--> statement-breakpoint
CREATE TABLE `whatsappOptIns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`contactId` int NOT NULL,
	`optedIn` boolean NOT NULL,
	`source` varchar(64) NOT NULL,
	`recordedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsappOptIns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `whatsappTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(255) NOT NULL,
	`languageCode` varchar(16) NOT NULL,
	`category` varchar(64) NOT NULL,
	`status` varchar(32) NOT NULL,
	`content` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `whatsappTemplates_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsappTemplates_name_unique` UNIQUE(`name`)
);
--> statement-breakpoint
CREATE TABLE `whatsappWebhookEvents` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventId` varchar(255) NOT NULL,
	`payload` json NOT NULL,
	`processedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `whatsappWebhookEvents_id` PRIMARY KEY(`id`),
	CONSTRAINT `whatsappWebhookEvents_eventId_unique` UNIQUE(`eventId`)
);
