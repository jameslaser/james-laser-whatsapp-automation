# WhatsApp Setup

## External configuration required

Set these variables as server-side project secrets, never in React code or committed files:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- `META_GRAPH_API_VERSION` (optional; defaults to `v23.0`)
- `WHATSAPP_APPROVED_TEMPLATE_NAMES` (comma-separated exact Meta-approved template names)
- `GEMINI_API_KEY`
- `GEMINI_MODEL` (optional; defaults to `gemini-2.5-flash`)
- `GEMINI_BASE_URL` (optional; defaults to the Google Generative Language API)

The configured Meta resource must be reviewed against the canonical identity: WABA `1833666484124208`, business portfolio `JAMES LASER`, app `James Laser Hair Removal WhatsApp Business App`. Conflicts are rejected or flagged, not silently changed.

## Webhook endpoint

Register the deployed endpoint as `GET/POST /webhooks/whatsapp`. Meta sends a verification challenge through GET and signed event payloads through POST. The server validates the `X-Hub-Signature-256` HMAC using `META_APP_SECRET`. Incoming messages are deduplicated, resolved to contacts, persisted, and passed to the server-side bilingual AI only when both Gemini and WhatsApp configuration are present. Delivery statuses (`sent`, `delivered`, `failed`) and read statuses are persisted against the WhatsApp message ID.

## Messaging requirements

Text, approved-template, and read-marker operations are available only to authenticated admin staff. Template names must be present in `WHATSAPP_APPROVED_TEMPLATE_NAMES`; unapproved names are rejected before any network request. Outbound messages require a conversation ID so the accepted Meta message ID can be audited in the database. Production messaging still requires review of opt-in, conversation-window rules, and approved content. No promotional send should occur for an opted-out contact.

## Current state

The source integration and persistence paths are implemented and tested. Real Meta delivery, webhook status receipt, and Gemini responses remain blocked until the server secrets, Meta webhook subscription, approved template names, and a safe Meta test recipient are configured. No real customer or marketing message was sent during testing.
