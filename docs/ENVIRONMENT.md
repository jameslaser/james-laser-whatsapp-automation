# Environment and Security

Secrets are server-only and must be injected through the project secret manager. Never use `VITE_` prefixes for WhatsApp tokens, Meta secrets, Gemini keys, webhook verify tokens, or database credentials.

## Variables

Required WhatsApp variables are `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_BUSINESS_ACCOUNT_ID`, `WHATSAPP_VERIFY_TOKEN`, `META_APP_SECRET`, and `WHATSAPP_APPROVED_TEMPLATE_NAMES`. Optional Meta configuration is `META_GRAPH_API_VERSION`. Gemini uses `GEMINI_API_KEY`, with optional `GEMINI_MODEL` and `GEMINI_BASE_URL`.

The canonical WhatsApp resource is WABA `1833666484124208` for `JAMES LASER` and the `James Laser Hair Removal WhatsApp Business App`. The implementation rejects unapproved template names, invalid provider or machine values, and unauthenticated staff/admin operations.

## Validation

Health checks report presence or connectivity without exposing secret values. A successful health response is not an end-to-end validation: the project still needs real database connectivity, Meta webhook delivery, approved-template sending, Gemini configuration, and repeat tests with authorized clinic data. During this implementation all external secret flags were absent, so no outbound Meta or Gemini request was attempted.
