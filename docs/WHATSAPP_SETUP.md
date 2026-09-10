# WhatsApp Setup

## External configuration required

Set these variables as server-side project secrets, never in React code or committed files:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `META_APP_SECRET`
- `META_GRAPH_API_VERSION` (optional; defaults to `v23.0`)

The configured Meta resource must be reviewed against the canonical identity: WABA `1833666484124208`, business portfolio `JAMES LASER`, app `James Laser Hair Removal WhatsApp Business App`. Conflicts should be flagged, not silently changed.

## Webhook endpoint

Register the deployed endpoint as `GET/POST /webhooks/whatsapp`. Meta sends a verification challenge through GET and signed event payloads through POST. The server validates the `X-Hub-Signature-256` HMAC using `META_APP_SECRET`.

## Messaging requirements

Template messages require Meta-approved template names and language codes. Production messaging also requires review of opt-in, conversation-window rules, and the business's approved content. No promotional send should occur for an opted-out contact.

## Current state

The source modules and route boundaries are created. Database migrations, resolver implementations, staff-auth authorization on management endpoints, approved templates, Meta subscription, and an end-to-end real-number test are still required.
