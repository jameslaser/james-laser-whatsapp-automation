# WhatsApp API Surface

## Registered routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/webhooks/whatsapp` | Meta webhook verification |
| POST | `/webhooks/whatsapp` | Signed incoming messages/status events |
| POST | `/api/whatsapp/send` | Send a text message |
| POST | `/api/whatsapp/template` | Send an approved template |
| POST | `/api/whatsapp/mark-read` | Mark a message as read |
| GET | `/api/health/integrations` | Non-secret integration health summary |
| GET | `/api/whatsapp/configuration` | Configuration presence only; no values |

Appointment, CRM, campaign, and inbox management routes should be added only after the database repository and staff authorization boundaries are implemented. The route module deliberately does not return fabricated conversations or appointments.
