# Automation

The automation service supports the requested job categories: appointment confirmation, 24-hour reminder, same-day reminder, cancellation, rescheduling, retouch reminder, next-session reminder, post-treatment follow-up, feedback request, no-show follow-up, and lead follow-up.

Every job carries an idempotency key and delivery metadata: recipient, conversation ID, approved template name, language code, and optional template components. The repository claims jobs atomically before execution, records sent or failed state, and the sender persists the accepted Meta message ID for later delivery/read-status updates.

The deterministic worker is exposed at `POST /api/scheduled/process-automations`. It accepts only an authenticated scheduled-task session and processes due jobs through the existing database repository and approved-template sender. Do not use an in-process timer. A deployed project-level Heartbeat job must be configured to call this path at the desired cadence after the updated checkpoint is deployed.

Scheduling and cancellation are protected admin operations. Jobs are never sent without an explicit recipient, conversation ID, approved template name, and `ar` or `en` language code. No worker is considered live until Meta configuration is present and a safe test recipient completes an actual accepted-send plus webhook-status round trip.
