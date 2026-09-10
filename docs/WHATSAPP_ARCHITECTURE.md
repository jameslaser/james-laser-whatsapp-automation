# James Laser WhatsApp Automation Architecture

## Scope

This project is a source foundation for the **James Laser Hair Removal WhatsApp Business App**, under the **JAMES LASER** business portfolio and canonical WABA `1833666484124208`. Secrets remain server-side. The project does not claim that WhatsApp, Gemini, database persistence, or scheduled delivery is live.

## Request flow

```text
Meta WhatsApp webhook
  -> signature verification
  -> duplicate-event protection
  -> webhook event parser
  -> contact resolver by WhatsApp number
  -> conversation service
  -> persistable message service
  -> AI agent (only when AI_ACTIVE)
  -> verified AI tools / appointment service
  -> human handoff or customer reply

Confirmed appointment
  -> machine availability and conflict checks
  -> automation job repository
  -> approved WhatsApp template sender
  -> delivery status webhook
```

## Modules

| Area | Source location | Responsibility |
|---|---|---|
| WhatsApp configuration | `server/integrations/whatsapp/config` | Server-only environment loading and canonical identity |
| Cloud API client | `server/integrations/whatsapp/client` | Text, template, interactive, media, and read-status calls |
| Webhook | `server/integrations/whatsapp/webhook` | Verification, HMAC validation, parsing, idempotency adapter |
| Conversations | `server/integrations/whatsapp/conversations` | AI/human states, assignment, takeover |
| AI | `server/ai` | Gemini boundary, bilingual safety prompt, verified tools, context |
| Appointments | `server/appointments` | Treatment duration, clinic hours, availability, conflicts, machine assignment |
| Automations | `server/automation` | Idempotent job lifecycle and execution boundary |
| Marketing | `server/marketing` | Consent-aware audience and campaign contracts |
| Health/audit | `server/health`, `server/audit` | Integration checks and immutable audit-entry contract |

## Explicit non-mock boundary

The database repository interfaces intentionally throw a clear error until the corresponding Drizzle tables and queries are implemented and migrated. The automation executor also refuses to send until a concrete template sender and repository are wired. This prevents test data or fake IDs from being mistaken for clinic records.
