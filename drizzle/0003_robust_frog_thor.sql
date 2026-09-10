ALTER TABLE `whatsappAutomations` ADD `recipient` varchar(32);--> statement-breakpoint
ALTER TABLE `whatsappAutomations` ADD `conversationId` int;--> statement-breakpoint
ALTER TABLE `whatsappAutomations` ADD `templateName` varchar(255);--> statement-breakpoint
ALTER TABLE `whatsappAutomations` ADD `languageCode` varchar(8);--> statement-breakpoint
ALTER TABLE `whatsappAutomations` ADD `components` json;