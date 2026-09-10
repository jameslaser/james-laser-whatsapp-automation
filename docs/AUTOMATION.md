# Automation

The automation service supports the requested job categories: confirmation, 24-hour reminder, same-day reminder, retouch reminder, next-session reminder, post-treatment follow-up, feedback request, no-show follow-up, and lead follow-up.

Every job carries `scheduledAt`, `status`, `attempts`, `lastAttemptAt`, `error`, `completedAt`, and an `idempotencyKey`. A repository must claim jobs atomically before execution. The sender must use approved WhatsApp templates and record delivery status.

The current executor intentionally throws until a real repository and sender are provided. This is a safety boundary: no background worker should send messages from unverified or mock data.
